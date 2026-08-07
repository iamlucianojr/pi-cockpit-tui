import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

/**
 * Shared git-info source for the footers.
 *
 * One `git status --porcelain=v2 --branch` call per refresh, cached per-cwd
 * with a 2-second TTL. Footers call `get(cwd)` synchronously on every render
 * — they always return the last cached snapshot (or `null` if not in a repo).
 *
 * Refresh triggers:
 *   - `tool_execution_end` for write/edit/bash — file mutations may have
 *     changed staged/unstaged state.
 *   - `workon:switch` — cwd changed.
 *   - 30s interval — keeps "minutes since last commit" honest.
 */

export interface GitInfo {
	branch: string | null;
	upstream: string | null;
	ahead: number;
	behind: number;
	staged: number;
	unstaged: number;
	untracked: number;
	conflicted: number;
	stashes: number;
	lastCommitMinutes: number | null;
	op: "rebase" | "merge" | "cherry-pick" | "revert" | "bisect" | null;
}

const TTL_MS = 2_000;
const REFRESH_INTERVAL_MS = 30_000;

interface CacheEntry {
	info: GitInfo | null;
	at: number;
	refreshing: boolean;
}

const cache = new Map<string, CacheEntry>();

function findGitRoot(cwd: string): string | null {
	let dir = cwd;
	while (true) {
		if (existsSync(join(dir, ".git"))) return dir;
		const parent = join(dir, "..");
		if (parent === dir) return null;
		dir = parent;
	}
}

function detectOp(gitRoot: string): GitInfo["op"] {
	const g = (p: string) => existsSync(join(gitRoot, ".git", p));
	if (g("rebase-merge") || g("rebase-apply") || g("REBASE_HEAD")) return "rebase";
	if (g("MERGE_HEAD")) return "merge";
	if (g("CHERRY_PICK_HEAD")) return "cherry-pick";
	if (g("REVERT_HEAD")) return "revert";
	if (g("BISECT_LOG")) return "bisect";
	return null;
}

async function runGit(gitRoot: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", args, {
		cwd: gitRoot,
		timeout: 1_500,
		maxBuffer: 1024 * 1024,
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
	});
	return stdout;
}

export function parsePorcelainV2(out: string): {
	branch: string | null;
	upstream: string | null;
	ahead: number;
	behind: number;
	staged: number;
	unstaged: number;
	untracked: number;
	conflicted: number;
} {
	let branch: string | null = null;
	let upstream: string | null = null;
	let ahead = 0;
	let behind = 0;
	let staged = 0;
	let unstaged = 0;
	let untracked = 0;
	let conflicted = 0;

	for (const line of out.split("\n")) {
		if (!line) continue;
		if (line.startsWith("# branch.head ")) {
			const v = line.slice("# branch.head ".length);
			branch = v === "(detached)" ? null : v;
			continue;
		}
		if (line.startsWith("# branch.upstream ")) {
			upstream = line.slice("# branch.upstream ".length);
			continue;
		}
		if (line.startsWith("# branch.ab ")) {
			// "# branch.ab +3 -1"
			const m = line.match(/\+(\d+)\s+-(\d+)/);
			if (m) {
				ahead = parseInt(m[1], 10);
				behind = parseInt(m[2], 10);
			}
			continue;
		}
		// Tracked entries: "1 XY ...", "2 XY ..." (renames)
		if (line[0] === "1" || line[0] === "2") {
			// XY is at index 2..3 of fields after split
			const xy = line.slice(2, 4);
			const x = xy[0];
			const y = xy[1];
			if (x !== "." && x !== " ") staged++;
			if (y !== "." && y !== " ") unstaged++;
			continue;
		}
		if (line[0] === "u") {
			conflicted++;
			continue;
		}
		if (line[0] === "?") {
			untracked++;
			continue;
		}
	}

	return { branch, upstream, ahead, behind, staged, unstaged, untracked, conflicted };
}

async function fetchGitInfo(gitRoot: string): Promise<GitInfo> {
	// One status call for branch + ab + file states.
	const status = await runGit(gitRoot, [
		"status",
		"--porcelain=v2",
		"--branch",
		"--untracked-files=normal",
	]);
	const parsed = parsePorcelainV2(status);

	// Last-commit age + stash count in parallel (cheap).
	const [tsRaw, stashRaw] = await Promise.all([
		runGit(gitRoot, ["log", "-1", "--format=%ct"]).catch(() => ""),
		runGit(gitRoot, ["stash", "list"]).catch(() => ""),
	]);

	let lastCommitMinutes: number | null = null;
	const ts = parseInt(tsRaw.trim(), 10);
	if (!isNaN(ts) && ts > 0) {
		lastCommitMinutes = Math.max(0, Math.floor((Date.now() / 1000 - ts) / 60));
	}

	const stashes = stashRaw ? stashRaw.trim().split("\n").filter(Boolean).length : 0;
	const op = detectOp(gitRoot);

	return {
		branch: parsed.branch,
		upstream: parsed.upstream,
		ahead: parsed.ahead,
		behind: parsed.behind,
		staged: parsed.staged,
		unstaged: parsed.unstaged,
		untracked: parsed.untracked,
		conflicted: parsed.conflicted,
		stashes,
		lastCommitMinutes,
		op,
	};
}

let busSubscribed = false;
let timer: ReturnType<typeof setInterval> | null = null;

function ensureSubscribed(pi: ExtensionAPI): void {
	if (busSubscribed) return;
	busSubscribed = true;

	pi.on("tool_execution_end", async (event: any) => {
		const t = event?.toolName;
		if (t === "write" || t === "edit" || t === "bash") {
			invalidateAll();
		}
	});

	pi.events?.on?.("workon:switch", () => invalidateAll());

	if (!timer) {
		timer = setInterval(() => invalidateAll(), REFRESH_INTERVAL_MS);
		(timer as any).unref?.();
	}
}

function invalidateAll(): void {
	for (const entry of cache.values()) entry.at = 0;
}

function refreshAsync(cwd: string, entry: CacheEntry): void {
	if (entry.refreshing) return;
	const root = findGitRoot(cwd);
	if (!root) {
		entry.info = null;
		entry.at = Date.now();
		return;
	}
	entry.refreshing = true;
	fetchGitInfo(root)
		.then((info) => {
			entry.info = info;
		})
		.catch(() => {
			// On failure, keep last good snapshot but mark fresh-ish to avoid hammering.
		})
		.finally(() => {
			entry.refreshing = false;
			entry.at = Date.now();
		});
}

export function createGitInfoSource(pi: ExtensionAPI): {
	get(cwd: string): GitInfo | null;
} {
	ensureSubscribed(pi);
	return {
		get(cwd: string): GitInfo | null {
			let entry = cache.get(cwd);
			if (!entry) {
				entry = { info: null, at: 0, refreshing: false };
				cache.set(cwd, entry);
			}
			const stale = Date.now() - entry.at > TTL_MS;
			if (stale) refreshAsync(cwd, entry);
			return entry.info;
		},
	};
}

/**
 * Format a GitInfo into a single coloured string for the footer.
 *
 * Layout (compact):
 *   ⎇ branch ↑3 ↓1 ●5 +2 ?1 ⚑1 …7m  ⚠ rebase
 *
 * Truncation order (drop right-to-left as width shrinks):
 *   1. operation banner (dropped first; only the branch is never dropped)
 *   2. ⚑ stashes
 *   3. …Nm   age
 *   4. ?N    untracked
 *   5. +N    staged
 *   6. ●N    unstaged
 *   7. ↑/↓   ahead/behind
 *   (branch always kept)
 */
export function formatGitInfo(info: GitInfo, theme: any, maxWidth?: number): string {
	if (!info.branch) return theme.fg("dim", "(detached)");

	const parts: { weight: number; text: string }[] = [];

	// Branch always rendered first, weight 0 = never dropped.
	parts.push({
		weight: 0,
		text: theme.fg("dim", "⎇ ") + theme.fg("success", info.branch),
	});

	if (info.upstream && (info.ahead || info.behind)) {
		const segs: string[] = [];
		if (info.ahead) segs.push(theme.fg("accent", `↑${info.ahead}`));
		if (info.behind) segs.push(theme.fg("warning", `↓${info.behind}`));
		parts.push({ weight: 6, text: " " + segs.join(" ") });
	} else if (!info.upstream) {
		parts.push({ weight: 6, text: " " + theme.fg("dim", "↥") });
	}

	if (info.unstaged) {
		parts.push({ weight: 5, text: " " + theme.fg("warning", `●${info.unstaged}`) });
	}
	if (info.conflicted) {
		parts.push({ weight: 5, text: " " + theme.fg("error", `✖${info.conflicted}`) });
	}
	if (info.staged) {
		parts.push({ weight: 4, text: " " + theme.fg("success", `+${info.staged}`) });
	}
	if (info.untracked) {
		parts.push({ weight: 3, text: " " + theme.fg("dim", `?${info.untracked}`) });
	}
	if (info.lastCommitMinutes !== null) {
		const age = formatAge(info.lastCommitMinutes);
		parts.push({ weight: 2, text: " " + theme.fg("dim", `…${age}`) });
	}
	if (info.stashes) {
		parts.push({ weight: 1, text: " " + theme.fg("dim", `⚑${info.stashes}`) });
	}
	if (info.op) {
		parts.push({
			weight: 0.5,
			text: " " + theme.fg("error", `⚠ ${info.op}`),
		});
	}

	if (maxWidth === undefined) return parts.map((p) => p.text).join("");

	// Greedy drop highest-weight (= lowest priority) first until it fits.
	const sorted = [...parts].sort((a, b) => a.weight - b.weight);
	const kept = new Set(parts);
	const widthOf = () =>
		[...kept]
			.map((p) => visibleLen(p.text))
			.reduce((s, n) => s + n, 0);
	for (let i = sorted.length - 1; i >= 0 && widthOf() > maxWidth; i--) {
		if (sorted[i].weight > 0) kept.delete(sorted[i]);
	}
	return parts.filter((p) => kept.has(p)).map((p) => p.text).join("");
}

function formatAge(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const h = Math.floor(minutes / 60);
	if (h < 24) return `${h}h`;
	const d = Math.floor(h / 24);
	if (d < 30) return `${d}d`;
	const mo = Math.floor(d / 30);
	return `${mo}mo`;
}

// Strip ANSI to estimate visible length without importing pi-tui (avoids a circular
// concern — pi-tui already does this, but keeping git.ts dependency-free is nicer).
function visibleLen(s: string): number {
	// eslint-disable-next-line no-control-regex
	return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

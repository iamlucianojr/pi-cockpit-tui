import { test } from "node:test";
import assert from "node:assert/strict";

import { renderBar, barFilled } from "../src/modules/footer/bar.ts";
import { parsePorcelainV2, formatGitInfo, type GitInfo } from "../src/modules/footer/git.ts";
import { merge, isFooterMode } from "../src/config.ts";
import { DEFAULT_CONFIG } from "../src/types.ts";
import { NEXT_STATUS, createState, type TaskStatus } from "../src/modules/tilldone/state.ts";

// ── Context bar ───────────────────────────────────────────────────────────────
// Regression: an unclamped bar did `"-".repeat(10 - filled)`, which throws
// RangeError once context usage passes 100%.

test("renderBar", async (t) => {
	await t.test("renders proportionally", () => {
		assert.equal(renderBar(0), "----------");
		assert.equal(renderBar(50), "#####-----");
		assert.equal(renderBar(100), "##########");
	});

	await t.test("clamps above 100% instead of throwing", () => {
		assert.equal(renderBar(118), "##########");
		assert.equal(renderBar(1000), "##########");
	});

	await t.test("clamps below zero", () => {
		assert.equal(renderBar(-5), "----------");
	});

	await t.test("survives NaN and undefined-ish input", () => {
		assert.equal(renderBar(NaN), "----------");
		assert.equal(renderBar(undefined as unknown as number), "----------");
	});

	await t.test("always returns exactly `width` cells", () => {
		for (const pct of [-50, 0, 33, 99.6, 100, 250, NaN]) {
			assert.equal(renderBar(pct).length, 10, `width wrong for ${pct}`);
		}
	});

	await t.test("barFilled agrees with renderBar", () => {
		for (const pct of [0, 25, 50, 100, 130]) {
			assert.equal(barFilled(pct), renderBar(pct).split("-")[0]!.length);
		}
	});
});

// ── git porcelain v2 parsing ──────────────────────────────────────────────────

test("parsePorcelainV2", async (t) => {
	await t.test("reads branch, upstream and ahead/behind", () => {
		const out = [
			"# branch.oid abc123",
			"# branch.head main",
			"# branch.upstream origin/main",
			"# branch.ab +3 -1",
		].join("\n");
		const r = parsePorcelainV2(out);
		assert.equal(r.branch, "main");
		assert.equal(r.upstream, "origin/main");
		assert.equal(r.ahead, 3);
		assert.equal(r.behind, 1);
	});

	await t.test("treats (detached) as no branch", () => {
		assert.equal(parsePorcelainV2("# branch.head (detached)").branch, null);
	});

	await t.test("counts staged, unstaged, untracked and conflicted", () => {
		const out = [
			"# branch.head main",
			"1 M. N... 100644 100644 100644 aaa bbb staged.txt",
			"1 .M N... 100644 100644 100644 aaa bbb unstaged.txt",
			"1 MM N... 100644 100644 100644 aaa bbb both.txt",
			"2 R. N... 100644 100644 100644 aaa bbb R100 new.txt\told.txt",
			"u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.txt",
			"? untracked.txt",
			"! ignored.txt",
		].join("\n");
		const r = parsePorcelainV2(out);
		assert.equal(r.staged, 3, "M., MM and the rename are staged");
		assert.equal(r.unstaged, 2, ".M and MM are unstaged");
		assert.equal(r.untracked, 1);
		assert.equal(r.conflicted, 1);
	});

	await t.test("empty output yields zeroed counters", () => {
		const r = parsePorcelainV2("");
		assert.deepEqual(
			{ ...r },
			{ branch: null, upstream: null, ahead: 0, behind: 0, staged: 0, unstaged: 0, untracked: 0, conflicted: 0 },
		);
	});
});

// ── git footer truncation ─────────────────────────────────────────────────────

const plainTheme = { fg: (_c: string, s: string) => s };

function gitInfo(overrides: Partial<GitInfo> = {}): GitInfo {
	return {
		branch: "main",
		upstream: "origin/main",
		ahead: 3,
		behind: 1,
		staged: 2,
		unstaged: 5,
		untracked: 1,
		conflicted: 0,
		stashes: 1,
		lastCommitMinutes: 7,
		op: "rebase",
		...overrides,
	};
}

test("formatGitInfo", async (t) => {
	await t.test("keeps the branch no matter how narrow the footer is", () => {
		const out = formatGitInfo(gitInfo(), plainTheme, 1);
		assert.ok(out.includes("main"), `branch missing from: ${JSON.stringify(out)}`);
	});

	await t.test("drops detail as width shrinks", () => {
		const wide = formatGitInfo(gitInfo(), plainTheme, 200);
		const narrow = formatGitInfo(gitInfo(), plainTheme, 12);
		assert.ok(narrow.length < wide.length);
		assert.ok(wide.includes("⚑1"), "stash count expected at full width");
		assert.ok(!narrow.includes("⚑1"), "stash count should be dropped when narrow");
	});

	await t.test("renders detached head without crashing", () => {
		assert.equal(formatGitInfo(gitInfo({ branch: null }), plainTheme, 40), "(detached)");
	});
});

// ── Config validation ─────────────────────────────────────────────────────────

test("config merge", async (t) => {
	await t.test("ignores wrong types and keeps the base value", () => {
		const r = merge(DEFAULT_CONFIG, { tabStatus: "yes", tilldone: 1, footerMode: 42 });
		assert.equal(r.tabStatus, DEFAULT_CONFIG.tabStatus);
		assert.equal(r.tilldone, DEFAULT_CONFIG.tilldone);
		assert.equal(r.footerMode, DEFAULT_CONFIG.footerMode);
	});

	await t.test("accepts valid overrides", () => {
		const r = merge(DEFAULT_CONFIG, { footerMode: "none", tilldone: true });
		assert.equal(r.footerMode, "none");
		assert.equal(r.tilldone, true);
	});

	await t.test("rejects unknown footer modes", () => {
		assert.equal(isFooterMode("tilldone"), true);
		assert.equal(isFooterMode("fancy"), false);
		assert.equal(isFooterMode(null), false);
	});
});

// ── Tilldone state machine ────────────────────────────────────────────────────

test("tilldone state", async (t) => {
	await t.test("cycles idle -> inprogress -> done -> idle", () => {
		let s: TaskStatus = "idle";
		s = NEXT_STATUS[s]; assert.equal(s, "inprogress");
		s = NEXT_STATUS[s]; assert.equal(s, "done");
		s = NEXT_STATUS[s]; assert.equal(s, "idle");
	});

	await t.test("createState returns a fresh, independent list", () => {
		const a = createState();
		a.tasks.push({ id: 1, text: "x", status: "idle" });
		assert.equal(createState().tasks.length, 0);
		assert.equal(createState().nextId, 1);
	});
});

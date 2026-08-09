import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import type { CockpitConfig, CockpitModule } from "../types.ts";
import { basename } from "node:path";

type StatusState = "new" | "running" | "doneCommitted" | "doneNoCommit" | "timeout";

const STATUS_TEXT: Record<StatusState, string> = {
	new: ":new",
	running: ":running...",
	doneCommitted: ":✅",
	doneNoCommit: ":⚡",
	timeout: ":⏰",
};

const INACTIVE_TIMEOUT_MS = 180_000;
const GIT_COMMIT_RE = /\bgit\b[^\n]*\bcommit\b/;

function cwdBase(ctx: ExtensionContext): string {
	return basename(ctx.cwd || "pi");
}

export function createTabStatusModule(pi: ExtensionAPI): CockpitModule {
	let state: StatusState = "new";
	let running = false;
	let sawCommit = false;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let ctx: ExtensionContext | undefined;

	const setTitle = (next: StatusState): void => {
		state = next;
		if (!ctx?.hasUI) return;
		ctx.ui.setTitle(`pi - ${cwdBase(ctx)}${STATUS_TEXT[next]}`);
	};

	const clearTimer = (): void => {
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
			timeoutId = undefined;
		}
	};

	const resetTimeout = (): void => {
		clearTimer();
		timeoutId = setTimeout(() => {
			if (running && state === "running") setTitle("timeout");
		}, INACTIVE_TIMEOUT_MS);
	};

	const markActivity = (): void => {
		if (state === "timeout") setTitle("running");
		if (!running) return;
		resetTimeout();
	};

	// Register event listeners once — they check `enabled` flag at runtime
	let enabled = false;

	pi.on("session_start", async (e: SessionStartEvent, c) => {
		ctx = c;
		if (!enabled) return;
		running = false; sawCommit = false; clearTimer();
		// On resume/fork, show committed state; new/startup start fresh
		const isResume = e.reason === "resume" || e.reason === "fork";
		setTitle(isResume ? "doneCommitted" : "new");
	});


	pi.on("before_agent_start", async (_e, c) => {
		ctx = c;
		if (!enabled) return;
		markActivity();
	});

	pi.on("agent_start", async (_e, c) => {
		ctx = c;
		if (!enabled) return;
		running = true; sawCommit = false;
		setTitle("running");
		resetTimeout();
	});

	pi.on("turn_start", async (_e, c) => {
		ctx = c;
		if (!enabled) return;
		markActivity();
	});

	pi.on("tool_call", async (e, c) => {
		ctx = c;
		if (!enabled) return;
		if ((e as any).toolName === "bash") {
			const cmd = typeof (e as any).input?.command === "string" ? (e as any).input.command : "";
			if (cmd && GIT_COMMIT_RE.test(cmd)) sawCommit = true;
		}
		markActivity();
	});

	pi.on("tool_result", async (_e, c) => {
		ctx = c;
		if (!enabled) return;
		markActivity();
	});

	pi.on("agent_end", async (e, c) => {
		ctx = c;
		if (!enabled) return;
		running = false; clearTimer();
		const messages: any[] = (e as any).messages ?? [];
		const last = [...messages].reverse().find((m: any) => m.role === "assistant");
		if (last?.stopReason === "error") { setTitle("timeout"); return; }
		setTitle(sawCommit ? "doneCommitted" : "doneNoCommit");
	});

	pi.on("session_shutdown", async (_e, c) => {
		ctx = c;
		clearTimer();
		if (!ctx.hasUI) return;
		ctx.ui.setTitle(`pi - ${cwdBase(ctx)}`);
	});

	return {
		activate(c: ExtensionContext, _cfg: CockpitConfig): void {
			ctx = c;
			enabled = true;
			setTitle("new");
		},
		deactivate(c: ExtensionContext): void {
			enabled = false;
			clearTimer();
			if (c.hasUI) c.ui.setTitle(`pi - ${cwdBase(c)}`);
		},
	};
}

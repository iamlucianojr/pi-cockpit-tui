import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CockpitConfig, CockpitModule } from "../types.ts";

interface SubState {
	id: number;
	status: "running" | "done" | "error";
	task: string;
	textChunks: string[];
	toolCount: number;
	elapsed: number;
	sessionFile: string;
	turnCount: number;
	proc?: ReturnType<typeof spawn>;
}

function sessionFile(id: number): string {
	const dir = path.join(os.homedir(), ".pi", "agent", "sessions", "subagents");
	fs.mkdirSync(dir, { recursive: true });
	return path.join(dir, `subagent-${id}-${Date.now()}.jsonl`);
}

export function createSubagentWidgetModule(pi: ExtensionAPI): CockpitModule {
	const agents = new Map<number, SubState>();
	let nextId = 1;
	let enabled = false;
	let activeCtx: ExtensionContext | undefined;

	function widgetKey(id: number): string {
		return `cockpit-sub-${id}`;
	}

	function updateWidget(ctx: ExtensionContext, state: SubState): void {
		if (!enabled) return;
		ctx.ui.setWidget(widgetKey(state.id), (_tui, theme) => {
			const container = new Container();
			const borderFn = (s: string) => theme.fg("dim", s);
			container.addChild(new Text("", 0, 0));
			container.addChild(new DynamicBorder(borderFn));
			const content = new Text("", 1, 0);
			container.addChild(content);
			container.addChild(new DynamicBorder(borderFn));

			return {
				render(width: number): string[] {
					const statusColor = state.status === "running" ? "accent"
						: state.status === "done" ? "success" : "error";
					const icon = state.status === "running" ? "●" : state.status === "done" ? "✓" : "✗";
					const preview = state.task.length > 40 ? state.task.slice(0, 37) + "..." : state.task;
					const turnLabel = state.turnCount > 1 ? theme.fg("dim", ` · Turn ${state.turnCount}`) : "";
					const lines: string[] = [
						theme.fg(statusColor, `${icon} Sub #${state.id}`) +
						turnLabel +
						theme.fg("dim", `  ${preview}`) +
						theme.fg("dim", `  (${Math.round(state.elapsed / 1000)}s | tools: ${state.toolCount})`),
					];
					const fullText = state.textChunks.join("");
					const lastLine = fullText.split("\n").filter(l => l.trim()).pop() ?? "";
					if (lastLine) {
						const trimmed = lastLine.length > width - 10 ? lastLine.slice(0, width - 13) + "..." : lastLine;
						lines.push(theme.fg("muted", `  ${trimmed}`));
					}
					content.setText(lines.join("\n"));
					return container.render(width);
				},
				invalidate() { container.invalidate(); },
			};
		});
	}

	// reuseId keeps /subcont on the same widget key; allocating a fresh id here
	// would register a widget that nothing ever clears.
	function spawnSub(task: string, ctx: ExtensionContext, continueSession?: string, reuseId?: number): SubState {
		const id = reuseId ?? nextId++;
		const sf = continueSession ?? sessionFile(id);
		const state: SubState = { id, status: "running", task, textChunks: [], toolCount: 0, elapsed: 0, sessionFile: sf, turnCount: continueSession ? 2 : 1 };
		agents.set(id, state);
		updateWidget(ctx, state);

		const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "openrouter/google/gemini-3-flash-preview";
		const args = ["--mode", "json", "-p", "--no-session", "--model", model, "--session", sf];
		if (continueSession) args.push("-c");
		args.push(task);

		const startTime = Date.now();
		const timer = setInterval(() => {
			state.elapsed = Date.now() - startTime;
			if (enabled && activeCtx) updateWidget(activeCtx, state);
		}, 1000);

		const proc = spawn("pi", args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });
		state.proc = proc;
		let buf = "";
		proc.stdout!.setEncoding("utf-8");
		proc.stdout!.on("data", (chunk: string) => {
			buf += chunk;
			const lines = buf.split("\n");
			buf = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const ev = JSON.parse(line);
					if (ev.type === "message_update" && ev.assistantMessageEvent?.type === "text_delta") {
						state.textChunks.push(ev.assistantMessageEvent.delta ?? "");
						if (enabled && activeCtx) updateWidget(activeCtx, state);
					} else if (ev.type === "tool_execution_start") {
						state.toolCount++;
						if (enabled && activeCtx) updateWidget(activeCtx, state);
					}
				} catch {}
			}
		});
		proc.on("close", (code) => {
			clearInterval(timer);
			state.elapsed = Date.now() - startTime;
			state.status = code === 0 ? "done" : "error";
			state.proc = undefined;
			if (enabled && activeCtx) {
				updateWidget(activeCtx, state);
				activeCtx.ui.notify(`Sub #${id} ${state.status} in ${Math.round(state.elapsed / 1000)}s`, state.status === "done" ? "info" : "error");
			}
		});
		return state;
	}

	// Commands
	pi.registerCommand("sub", {
		description: "Spawn a background subagent: /sub <task>",
		handler: async (args, ctx) => {
			activeCtx = ctx;
			if (!enabled) { ctx.ui.notify("subagent-widget disabled in /cockpit", "warning"); return; }
			if (!args.trim()) { ctx.ui.notify("Usage: /sub <task>", "error"); return; }
			const state = spawnSub(args.trim(), ctx);
			ctx.ui.notify(`Sub #${state.id} started`, "info");
		},
	});

	pi.registerCommand("subcont", {
		description: "Continue subagent session: /subcont <id> <message>",
		handler: async (args, ctx) => {
			activeCtx = ctx;
			if (!enabled) { ctx.ui.notify("subagent-widget disabled in /cockpit", "warning"); return; }
			const [idStr, ...rest] = args.trim().split(/\s+/);
			const id = parseInt(idStr ?? "", 10);
			const message = rest.join(" ");
			if (!id || !message) { ctx.ui.notify("Usage: /subcont <id> <message>", "error"); return; }
			const existing = agents.get(id);
			if (!existing) { ctx.ui.notify(`Sub #${id} not found`, "error"); return; }
			if (existing.status === "running") { ctx.ui.notify(`Sub #${id} is still running`, "warning"); return; }
			const state = spawnSub(message, ctx, existing.sessionFile, id);
			state.turnCount = existing.turnCount + 1;
			agents.set(id, state);
			ctx.ui.notify(`Sub #${id} continued (turn ${state.turnCount})`, "info");
		},
	});

	pi.registerCommand("subrm", {
		description: "Remove subagent widget: /subrm <id>",
		handler: async (args, ctx) => {
			activeCtx = ctx;
			if (!enabled) { ctx.ui.notify("subagent-widget disabled in /cockpit", "warning"); return; }
			const id = parseInt(args.trim(), 10);
			if (!id) { ctx.ui.notify("Usage: /subrm <id>", "error"); return; }
			const state = agents.get(id);
			if (state?.proc) state.proc.kill("SIGTERM");
			agents.delete(id);
			ctx.ui.setWidget(widgetKey(id), undefined);
		},
	});

	pi.registerCommand("subclear", {
		description: "Clear all subagent widgets",
		handler: async (_args, ctx) => {
			activeCtx = ctx;
			if (!enabled) { ctx.ui.notify("subagent-widget disabled in /cockpit", "warning"); return; }
			for (const [id, state] of agents) {
				if (state.proc) state.proc.kill("SIGTERM");
				ctx.ui.setWidget(widgetKey(id), undefined);
			}
			agents.clear();
			ctx.ui.notify("All subagents cleared", "info");
		},
	});

	return {
		activate(ctx, _cfg: CockpitConfig): void {
			enabled = true;
			activeCtx = ctx;
			// Re-render existing widgets
			for (const state of agents.values()) updateWidget(ctx, state);
		},
		deactivate(ctx): void {
			enabled = false;
			for (const [id] of agents) ctx.ui.setWidget(widgetKey(id), undefined);
		},
	};
}

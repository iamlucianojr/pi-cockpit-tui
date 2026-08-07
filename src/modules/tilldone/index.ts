import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import type { CockpitConfig, CockpitModule } from "../../types.ts";
import { createState, STATUS_ICON, NEXT_STATUS, type Task, type TillDoneState } from "./state.ts";

const WIDGET_KEY = "cockpit-tilldone-current";

// ── Overlay component ─────────────────────────────────────────────────────────

class TillDoneOverlay {
	// State is read through a getter so the overlay never detaches when
	// new-list/clear replace the state object.
	private getState: () => TillDoneState;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(getState: () => TillDoneState) {
		this.getState = getState;
	}

	private get state(): TillDoneState {
		return this.getState();
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		const lines: string[] = [""];
		// We can't access theme here easily — use ANSI directly
		const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
		const accent = (s: string) => `\x1b[38;5;75m${s}\x1b[39m`;
		const success = (s: string) => `\x1b[38;5;77m${s}\x1b[39m`;
		const muted = (s: string) => `\x1b[2m${s}\x1b[22m`;

		const heading = this.state.listTitle
			? accent(` ${this.state.listTitle} `)
			: accent(" TillDone ");
		const headingLen = (this.state.listTitle?.length ?? 8) + 2;
		lines.push(truncateToWidth(
			dim("─".repeat(3)) + heading + dim("─".repeat(Math.max(0, width - 3 - headingLen))),
			width,
		));
		if (this.state.listDescription) lines.push(`  ${muted(this.state.listDescription)}`);
		lines.push("");

		if (this.state.tasks.length === 0) {
			lines.push(`  ${dim("No tasks yet.")}`);
		} else {
			const done = this.state.tasks.filter(t => t.status === "done").length;
			const active = this.state.tasks.filter(t => t.status === "inprogress").length;
			const idle = this.state.tasks.filter(t => t.status === "idle").length;
			lines.push(`  ${success(`${done} done`)}  ${accent(`${active} active`)}  ${muted(`${idle} idle`)}`);
			lines.push("");
			for (const task of this.state.tasks) {
				const icon = task.status === "done" ? success(STATUS_ICON.done)
					: task.status === "inprogress" ? accent(STATUS_ICON.inprogress)
					: dim(STATUS_ICON.idle);
				const id = accent(`#${task.id}`);
				const text = task.status === "done" ? dim(task.text)
					: task.status === "inprogress" ? success(task.text)
					: muted(task.text);
				lines.push(truncateToWidth(`  ${icon} ${id} ${text}`, width));
			}
		}
		lines.push("");
		lines.push(truncateToWidth(`  ${dim("Run /tilldone again to close")}`, width));
		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

// ── Module ────────────────────────────────────────────────────────────────────

export function createTillDoneModule(pi: ExtensionAPI): CockpitModule & { getState(): TillDoneState } {
	let state = createState();
	let enabled = false;
	let activeCtx: ExtensionContext | undefined;
	let overlayOpen = false;

	function refreshWidget(ctx: ExtensionContext): void {
		const current = state.tasks.find(t => t.status === "inprogress");
		if (!current) { ctx.ui.setWidget(WIDGET_KEY, undefined); return; }

		ctx.ui.setWidget(WIDGET_KEY, (_tui, theme) => {
			const container = new Container();
			const borderFn = (s: string) => theme.fg("dim", s);
			container.addChild(new Text("", 0, 0));
			container.addChild(new DynamicBorder(borderFn));
			const content = new Text("", 1, 0);
			container.addChild(content);
			container.addChild(new DynamicBorder(borderFn));

			return {
				render(width: number): string[] {
					const cur = state.tasks.find(t => t.status === "inprogress");
					if (!cur) return [];
					const line =
						theme.fg("accent", "● ") +
						theme.fg("dim", "WORKING ON  ") +
						theme.fg("accent", `#${cur.id}`) +
						theme.fg("dim", "  ") +
						theme.fg("success", cur.text);
					content.setText(truncateToWidth(line, width - 4));
					return container.render(width);
				},
				invalidate() { container.invalidate(); },
			};
		}, { placement: "belowEditor" });
	}

	function refreshStatus(ctx: ExtensionContext): void {
		const done = state.tasks.filter(t => t.status === "done").length;
		const total = state.tasks.length;
		ctx.ui.setStatus("cockpit-tilldone", total === 0 ? "TillDone" : `${done}/${total} done`);
	}

	// ── tilldone tool ─────────────────────────────────────────────────────────
	pi.registerTool({
		name: "tilldone",
		label: "TillDone",
		description: "Manage session tasks. Always call `new-list` at session start to declare what you will do. Add tasks with `add`, mark progress with `toggle`, and finish with `list` to review.",
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("new-list"),
				Type.Literal("add"),
				Type.Literal("toggle"),
				Type.Literal("remove"),
				Type.Literal("update"),
				Type.Literal("list"),
				Type.Literal("clear"),
			], { description: "Action to perform" }),
			text: Type.Optional(Type.String({ description: "Task text (for add/update) or list title (for new-list)" })),
			texts: Type.Optional(Type.Array(Type.String(), { description: "Multiple task texts (for add)" })),
			description: Type.Optional(Type.String({ description: "List description (for new-list)" })),
			id: Type.Optional(Type.Number({ description: "Task ID (for toggle/remove/update)" })),
		}),

		execute: async (_toolCallId, params: any) => {
			const { action } = params;
			const text = (content: string) => ({ content: [{ type: "text" as const, text: content }], details: {} as unknown });
			if (!enabled) return text("tilldone is disabled. Enable it with /cockpit toggle tilldone.");
			const ctx = activeCtx;

			switch (action) {
				case "new-list": {
					state = createState();
					state.listTitle = params.text ?? "Session Tasks";
					state.listDescription = params.description;
					if (ctx) { refreshWidget(ctx); refreshStatus(ctx); }
					return text(`Started new list: "${state.listTitle}"`);
				}
				case "add": {
					const toAdd: string[] = params.texts ?? (params.text ? [params.text] : []);
					for (const t of toAdd) {
						state.tasks.push({ id: state.nextId++, text: t, status: "idle" });
					}
					if (ctx) { refreshWidget(ctx); refreshStatus(ctx); }
					return text(`Added ${toAdd.length} task(s). Total: ${state.tasks.length}`);
				}
				case "toggle": {
					const task = state.tasks.find(t => t.id === params.id);
					if (!task) return text(`Task #${params.id} not found`);
					task.status = NEXT_STATUS[task.status];
					if (ctx) { refreshWidget(ctx); refreshStatus(ctx); }
					return text(`Task #${task.id} → ${task.status}`);
				}
				case "remove": {
					const before = state.tasks.length;
					state.tasks = state.tasks.filter(t => t.id !== params.id);
					if (ctx) { refreshWidget(ctx); refreshStatus(ctx); }
					return text(state.tasks.length < before ? `Removed #${params.id}` : `Task #${params.id} not found`);
				}
				case "update": {
					const task = state.tasks.find(t => t.id === params.id);
					if (!task) return text(`Task #${params.id} not found`);
					if (params.text) task.text = params.text;
					if (ctx) refreshWidget(ctx);
					return text(`Updated #${task.id}: "${task.text}"`);
				}
				case "list": {
					if (state.tasks.length === 0) return text("No tasks.");
					const lines = state.tasks.map(t => `${STATUS_ICON[t.status]} #${t.id} ${t.text} [${t.status}]`);
					return text(lines.join("\n"));
				}
				case "clear": {
					state = createState();
					if (ctx) { refreshWidget(ctx); refreshStatus(ctx); }
					return text("Cleared all tasks.");
				}
				default:
					return text(`Unknown action: ${action}`);
			}
		},
	});

	// ── /tilldone overlay command ─────────────────────────────────────────────
	pi.registerCommand("tilldone", {
		description: "Show task list as a widget overlay: /tilldone",
		handler: async (_args, ctx) => {
			activeCtx = ctx;
			if (!ctx.hasUI) return;
			if (!enabled) { ctx.ui.notify("tilldone is disabled in /cockpit", "warning"); return; }
			const OVERLAY_KEY = "cockpit-tilldone-overlay";
			if (overlayOpen) {
				ctx.ui.setWidget(OVERLAY_KEY, undefined);
				overlayOpen = false;
				return;
			}
			const overlay = new TillDoneOverlay(() => state);
			ctx.ui.setWidget(OVERLAY_KEY, () => ({
				render: (width: number) => overlay.render(width),
				invalidate: () => overlay.invalidate(),
				dispose: () => {},
			}));
			overlayOpen = true;
		},
	});

	// Tasks are per session. The state used to be invisible, so leaking it across
	// a /new session went unnoticed; the footer now shows it, so reset it here.
	pi.on("session_start", async (_e, ctx) => {
		state = createState();
		activeCtx = ctx;
		overlayOpen = false;
		if (enabled && ctx.hasUI) { refreshWidget(ctx); refreshStatus(ctx); }
	});

	// ── Agent end nudge ───────────────────────────────────────────────────────
	pi.on("agent_end", async (_e, ctx) => {
		if (!enabled) return;
		activeCtx = ctx;
		const remaining = state.tasks.filter(t => t.status !== "done");
		if (remaining.length > 0) {
			ctx.ui.notify(
				`${remaining.length} task(s) not done. Use tilldone{action:"toggle", id:N} to update.`,
				"warning",
			);
		}
	});

	return {
		getState(): TillDoneState {
			return state;
		},
		activate(ctx, _cfg: CockpitConfig): void {
			enabled = true;
			activeCtx = ctx;
			refreshWidget(ctx);
			refreshStatus(ctx);
		},
		deactivate(ctx): void {
			enabled = false;
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			ctx.ui.setWidget("cockpit-tilldone-overlay", undefined);
			overlayOpen = false;
		},
	};
}

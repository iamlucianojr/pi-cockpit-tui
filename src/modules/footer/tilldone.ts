import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { STATUS_ICON, type TillDoneState } from "../tilldone/state.ts";
import type { SessionInfo } from "./info.ts";

/** Apply the tilldone footer. Call again whenever task state changes. */
export function applyTilldoneFooter(
	ctx: ExtensionContext,
	getState: () => TillDoneState,
	getInfo?: (ctx: ExtensionContext) => SessionInfo,
): void {
	ctx.ui.setFooter((tui, theme, footerData) => {
		const unsub = footerData.onBranchChange(() => tui.requestRender());
		return {
			dispose: unsub,
			invalidate() {},
			render(width: number): string[] {
				const state = getState();
				const info = getInfo?.(ctx);
				const done = state.tasks.filter(t => t.status === "done").length;
				const active = state.tasks.filter(t => t.status === "inprogress").length;
				const idle = state.tasks.filter(t => t.status === "idle").length;
				const total = state.tasks.length;

				const titleDisplay = state.listTitle
					? theme.fg("accent", ` ${state.listTitle} `)
					: theme.fg("dim", " TillDone ");

				const l1Left = total === 0
					? titleDisplay + theme.fg("muted", "no tasks")
					: titleDisplay +
						theme.fg("warning", "[") +
						theme.fg("success", `${done}`) +
						theme.fg("dim", "/") +
						theme.fg("success", `${total}`) +
						theme.fg("warning", "]");

				const l1Right = total === 0 ? "" :
					theme.fg("dim", STATUS_ICON.idle + " ") + theme.fg("muted", `${idle}`) +
					theme.fg("dim", "  ") +
					theme.fg("accent", STATUS_ICON.inprogress + " ") + theme.fg("accent", `${active}`) +
					theme.fg("dim", "  ") +
					theme.fg("success", STATUS_ICON.done + " ") + theme.fg("success", `${done}`) +
					theme.fg("dim", " ");

				const pad1 = " ".repeat(Math.max(1, width - visibleWidth(l1Left) - visibleWidth(l1Right)));
				const line1 = truncateToWidth(l1Left + pad1 + l1Right, width, "");

				// Optional info header: provider/model + project + session name
				let infoLine: string | undefined;
				if (info) {
					const modelLabel = info.provider ? `${info.provider}/${info.model}` : info.model;
					const parts = [theme.fg("dim", ` ${modelLabel}`)];
					if (info.project) parts.push(theme.fg("success", info.project));
					if (info.sessionName) parts.push(theme.fg("accent", info.sessionName));
					infoLine = truncateToWidth(parts.join(theme.fg("dim", " \u00b7 ")), width, "");
				}

				if (total === 0) return infoLine ? [infoLine, line1] : [line1];

				const activeTasks = state.tasks.filter(t => t.status === "inprogress");
				const doneTasks = [...state.tasks.filter(t => t.status === "done")].reverse();
				const visible = [...activeTasks, ...doneTasks].slice(0, 5);

				const rows = visible.map(t => {
					const icon = t.status === "done"
						? theme.fg("success", STATUS_ICON.done)
						: theme.fg("accent", STATUS_ICON.inprogress);
					const text = t.status === "done" ? theme.fg("dim", t.text) : theme.fg("success", t.text);
					return truncateToWidth(` ${icon} ${text}`, width, "");
				});

				const remaining = total - visible.length;
				if (remaining > 0) rows.push(truncateToWidth(`  ${theme.fg("dim", `+${remaining} more`)}`, width, ""));

				return infoLine ? [infoLine, line1, ...rows] : [line1, ...rows];
			},
		};
	});
}

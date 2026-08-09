import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { basename } from "node:path";
import type { SessionInfo } from "./info.ts";
import { createGitInfoSource, formatGitInfo } from "./git.ts";
import { barFilled } from "./bar.ts";

export function createToolCounterFooterModule(
	pi: ExtensionAPI,
	getInfo?: (ctx: ExtensionContext) => SessionInfo,
) {
	const counts: Record<string, number> = {};
	const gitInfo = createGitInfoSource(pi);

	pi.on("tool_execution_end", async (event) => {
		counts[(event as any).toolName] = (counts[(event as any).toolName] ?? 0) + 1;
	});

	function apply(ctx: ExtensionContext): void {
		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsubBranch = footerData.onBranchChange(() => tui.requestRender());
			// 2s tick — picks up git status changes (gitInfo source invalidates its
			// own cache on tool_execution_end via createGitInfoSource).
			const tick = setInterval(() => tui.requestRender(), 2_000);
			(tick as any).unref?.();
			return {
				dispose: () => {
					unsubBranch();
					clearInterval(tick);
				},
				invalidate() {},
				render(width: number): string[] {
					// Line 1: model + context bar (left) | tokens + cost (right)
					let tokIn = 0, tokOut = 0, cost = 0;
					for (const entry of ctx.sessionManager.getBranch()) {
						if (entry.type === "message" && (entry.message as any).role === "assistant") {
							const m = entry.message as any;
							tokIn += m.usage?.input ?? 0;
							tokOut += m.usage?.output ?? 0;
							cost += m.usage?.cost?.total ?? 0;
						}
					}

					const fmt = (n: number) => n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`;
					const usage = ctx.getContextUsage();
					const pct = usage?.percent ?? 0;
					const filled = barFilled(pct);
					const info = getInfo?.(ctx);
					const model = info?.model ?? ctx.model?.id ?? "no-model";
					const provider = info?.provider;
					const modelLabel = provider ? `${provider}/${model}` : model;

					const l1Left =
						theme.fg("dim", ` ${modelLabel} `) +
						theme.fg("warning", "[") +
						theme.fg("success", "#".repeat(filled)) +
						theme.fg("dim", "-".repeat(10 - filled)) +
						theme.fg("warning", "]") +
						theme.fg("dim", " ") +
						theme.fg("accent", `${Math.round(pct)}%`);

					const l1Right =
						theme.fg("success", fmt(tokIn)) +
						theme.fg("dim", " in ") +
						theme.fg("accent", fmt(tokOut)) +
						theme.fg("dim", " out ") +
						theme.fg("warning", `$${cost.toFixed(4)}`) +
						theme.fg("dim", " ");

					const pad1 = " ".repeat(Math.max(1, width - visibleWidth(l1Left) - visibleWidth(l1Right)));
					const line1 = truncateToWidth(l1Left + pad1 + l1Right, width, "");

					// Line 2: project / cwd + git status + session-name (left) | tool tally (right)
					const dir = basename(ctx.cwd);
					const project = info?.project;
					const projectPath = info?.projectPath;
					const sessionName = info?.sessionName;

					const projectLabel = project
						? theme.fg("success", project)
						: theme.fg("dim", dir);

					// Show git info for the active workon project if available, otherwise workspace
					const gitCwd = projectPath ?? ctx.cwd;
					const gi = gitInfo.get(gitCwd);
					const gitStr = gi ? formatGitInfo(gi, theme) : "";

					const l2Left =
						theme.fg("dim", " ") +
						projectLabel +
						(gitStr ? theme.fg("dim", "  ") + gitStr : "") +
						(sessionName
							? theme.fg("dim", " \u00b7 ") + theme.fg("accent", sessionName)
							: "");

					const entries = Object.entries(counts);
					const l2Right = entries.length === 0
						? theme.fg("dim", "waiting for tools ")
						: entries.map(([name, count]) =>
							theme.fg("accent", name) + theme.fg("dim", " ") + theme.fg("success", `${count}`)
						).join(theme.fg("warning", " | ")) + theme.fg("dim", " ");

					const pad2 = " ".repeat(Math.max(1, width - visibleWidth(l2Left) - visibleWidth(l2Right)));
					const line2 = truncateToWidth(l2Left + pad2 + l2Right, width, "");

					return [line1, line2];
				},
			};
		});
	}

	return { apply, counts };
}

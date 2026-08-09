import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { SessionInfo } from "./info.ts";
import { renderBar } from "./bar.ts";

export function applyMinimalFooter(
	ctx: ExtensionContext,
	getInfo?: (ctx: ExtensionContext) => SessionInfo,
): void {
	ctx.ui.setFooter((_tui, theme, _footerData) => ({
		dispose: () => {},
		invalidate() {},
		render(width: number): string[] {
			const info = getInfo?.(ctx);
			const model = info?.model ?? ctx.model?.id ?? "no-model";
			const provider = info?.provider;
			const project = info?.project;
			const sessionName = info?.sessionName;
			const usage = ctx.getContextUsage();
			const pct = usage?.percent ?? 0;
			const bar = renderBar(pct);

			const modelLabel = provider ? `${provider}/${model}` : model;
			const metaParts: string[] = [];
			if (project) metaParts.push(theme.fg("success", project));
			if (sessionName) metaParts.push(theme.fg("accent", sessionName));
			const meta = metaParts.length > 0 ? " " + metaParts.join(theme.fg("dim", " \u00b7 ")) : "";

			const left = theme.fg("dim", ` ${modelLabel}`) + meta;
			const right = theme.fg("dim", `[${bar}] ${Math.round(pct)}% `);
			const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
			return [truncateToWidth(left + pad + right, width)];
		},
	}));
}

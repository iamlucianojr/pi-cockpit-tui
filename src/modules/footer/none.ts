import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export function applyNoneFooter(ctx: ExtensionContext): void {
	ctx.ui.setFooter((_tui, _theme, _footerData) => ({
		dispose: () => {},
		invalidate() {},
		render(_width: number): string[] {
			return [];
		},
	}));
}

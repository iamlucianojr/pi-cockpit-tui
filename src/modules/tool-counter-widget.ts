import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { CockpitConfig, CockpitModule } from "../types.ts";

const WIDGET_KEY = "cockpit-tool-counter";

const PALETTE: number[][] = [
	[12, 40, 80],
	[50, 20, 70],
	[10, 55, 45],
	[70, 30, 10],
	[55, 15, 40],
	[15, 50, 65],
	[45, 45, 15],
	[65, 18, 25],
];

function bg(rgb: number[], s: string): string {
	return `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m${s}\x1b[49m`;
}

export function createToolCounterWidgetModule(pi: ExtensionAPI): CockpitModule {
	const counts: Record<string, number> = {};
	const toolColors: Record<string, number[]> = {};
	let total = 0;
	let colorIdx = 0;
	let enabled = false;
	let activeCtx: ExtensionContext | undefined;

	pi.on("tool_execution_end", async (event) => {
		const name = (event as any).toolName as string;
		if (!(name in toolColors)) {
			toolColors[name] = PALETTE[colorIdx % PALETTE.length]!;
			colorIdx++;
		}
		counts[name] = (counts[name] ?? 0) + 1;
		total++;
		// Trigger re-render if active — setWidget with same key refreshes
		if (enabled && activeCtx) install(activeCtx);
	});

	function install(ctx: ExtensionContext): void {
		ctx.ui.setWidget(WIDGET_KEY, (_tui, theme) => {
			const text = new Text("", 1, 1);
			return {
				render(width: number): string[] {
					const entries = Object.entries(counts);
					const parts = entries.map(([name, count]) => {
						const rgb = toolColors[name]!;
						return bg(rgb, `\x1b[38;2;220;220;220m  ${name} ${count}  \x1b[39m`);
					});
					text.setText(
						theme.fg("accent", `Tools (${total}):`) +
						(entries.length > 0 ? " " + parts.join(" ") : ""),
					);
					return text.render(width);
				},
				invalidate() { text.invalidate(); },
			};
		});
	}

	return {
		activate(ctx, _cfg: CockpitConfig): void {
			enabled = true;
			activeCtx = ctx;
			install(ctx);
		},
		deactivate(ctx): void {
			enabled = false;
			activeCtx = undefined;
			ctx.ui.setWidget(WIDGET_KEY, undefined);
		},
	};
}

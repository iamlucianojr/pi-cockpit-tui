import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { CockpitConfig, CockpitModule } from "../types.ts";

const SWATCH_KEY = "cockpit-theme-swatch";
const SWATCH_DURATION_MS = 3000;

export function createThemeCyclerModule(pi: ExtensionAPI): CockpitModule {
	let swatchTimer: ReturnType<typeof setTimeout> | null = null;
	let enabled = false;
	let swatchEnabled = true;

	function clearSwatch(): void {
		if (swatchTimer) { clearTimeout(swatchTimer); swatchTimer = null; }
	}

	function showSwatch(ctx: ExtensionContext): void {
		if (!swatchEnabled || !ctx.hasUI) return;
		clearSwatch();
		ctx.ui.setWidget(SWATCH_KEY, (_tui, theme) => ({
			invalidate() {},
			render(width: number): string[] {
				const block = "\u2588\u2588\u2588";
				const swatch =
					theme.fg("success", block) + " " +
					theme.fg("accent", block) + " " +
					theme.fg("warning", block) + " " +
					theme.fg("dim", block) + " " +
					theme.fg("muted", block);
				const label = theme.fg("accent", " 🎨 ") + theme.fg("muted", ctx.ui.theme.name ?? "") + "  " + swatch;
				const border = theme.fg("borderMuted", "─".repeat(Math.max(0, width)));
				return [border, truncateToWidth("  " + label, width), border];
			},
		}), { placement: "belowEditor" });

		swatchTimer = setTimeout(() => {
			ctx.ui.setWidget(SWATCH_KEY, undefined);
			swatchTimer = null;
		}, SWATCH_DURATION_MS);
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus("cockpit-theme", `🎨 ${ctx.ui.theme.name}`);
	}

	function cycleTheme(ctx: ExtensionContext, direction: 1 | -1): void {
		if (!ctx.hasUI) return;
		const themes = ctx.ui.getAllThemes();
		if (!themes.length) { ctx.ui.notify("No themes available", "warning"); return; }
		const current = themes.findIndex(t => t.name === ctx.ui.theme.name);
		const idx = ((current === -1 ? 0 : current) + direction + themes.length) % themes.length;
		const themeName = themes[idx]?.name ?? "";
		const result = ctx.ui.setTheme(themeName);
		if (result.success) {
			updateStatus(ctx);
			showSwatch(ctx);
			ctx.ui.notify(`${themeName} (${idx + 1}/${themes.length})`, "info");
		} else {
			ctx.ui.notify(`Failed to set theme: ${result.error}`, "error");
		}
	}

	// Register shortcuts + command once — guarded by `enabled`
	pi.registerShortcut("alt+t", {
		description: "Cycle theme forward (cockpit)",
		handler: async (ctx) => {
			if (!enabled) return;
			cycleTheme(ctx, 1);
		},
	});

	pi.registerShortcut("alt+shift+t", {
		description: "Cycle theme backward (cockpit)",
		handler: async (ctx) => {
			if (!enabled) return;
			cycleTheme(ctx, -1);
		},
	});

	pi.registerCommand("theme", {
		description: "Select or set a theme: /theme or /theme <name>",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;
			if (!enabled) { ctx.ui.notify("theme-cycler disabled in /cockpit", "warning"); return; }
			const themes = ctx.ui.getAllThemes();
			const arg = args.trim();
			if (arg) {
				const result = ctx.ui.setTheme(arg);
				if (result.success) {
					updateStatus(ctx);
					showSwatch(ctx);
					ctx.ui.notify(`Theme: ${arg}`, "info");
				} else {
					ctx.ui.notify(`Theme not found: ${arg}`, "error");
				}
				return;
			}
			const items = themes.map(t => {
				const active = t.name === ctx.ui.theme.name ? " (active)" : "";
				return `${t.name}${active} — ${t.path ?? "built-in"}`;
			});
			const selected = await ctx.ui.select("Select Theme", items);
			if (!selected) return;
			const name = selected.split(/\s/)[0]!;
			const result = ctx.ui.setTheme(name);
			if (result.success) { updateStatus(ctx); showSwatch(ctx); ctx.ui.notify(`Theme: ${name}`, "info"); }
		},
	});

	return {
		activate(ctx, cfg: CockpitConfig): void {
			enabled = true;
			swatchEnabled = cfg.themeSwatch;
			updateStatus(ctx);
		},
		deactivate(ctx): void {
			enabled = false;
			clearSwatch();
			ctx.ui.setWidget(SWATCH_KEY, undefined);
		},
	};
}

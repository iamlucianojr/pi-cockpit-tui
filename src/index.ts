/**
 * pi-cockpit-tui — Unified terminal UI extension for pi.
 *
 * Consolidates tab-status, footer modes (minimal / tool-counter / tilldone / none),
 * tool-counter widget, theme cycling, subagent widgets, purpose-gate, and tilldone
 * task management into a single hot-reload-configurable extension.
 *
 * Config: .pi/cockpit.json (project) or ~/.pi/cockpit.json (global)
 * Toggle live: /cockpit command
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { loadConfig, saveConfig } from "./config.ts";
import { showCockpitUI } from "./cockpit-command.ts";
import { applyMinimalFooter } from "./modules/footer/minimal.ts";
import { applyNoneFooter } from "./modules/footer/none.ts";
import { createToolCounterFooterModule } from "./modules/footer/tool-counter.ts";
import { applyTilldoneFooter } from "./modules/footer/tilldone.ts";
import { createSessionInfoSource } from "./modules/footer/info.ts";
import { createTabStatusModule } from "./modules/tab-status.ts";
import { createToolCounterWidgetModule } from "./modules/tool-counter-widget.ts";
import { createThemeCyclerModule } from "./modules/theme-cycler.ts";
import { createPurposeGateModule } from "./modules/purpose-gate.ts";
import { createSubagentWidgetModule } from "./modules/subagent-widget.ts";
import { createTillDoneModule } from "./modules/tilldone/index.ts";
import type { CockpitConfig, CockpitModule } from "./types.ts";

export default function (pi: ExtensionAPI) {
	// ── Create modules (register tools/commands/shortcuts once) ──────────────
	const tabStatusMod    = createTabStatusModule(pi);
	const toolWidgetMod   = createToolCounterWidgetModule(pi);
	const themeCyclerMod  = createThemeCyclerModule(pi);
	const purposeGateMod  = createPurposeGateModule(pi);
	const subagentMod     = createSubagentWidgetModule(pi);
	const tilldoneMod     = createTillDoneModule(pi);
	const sessionInfo     = createSessionInfoSource(pi);
	const getInfo         = (ctx: ExtensionContext) => sessionInfo.get(ctx);
	const toolFooter      = createToolCounterFooterModule(pi, getInfo);

	let activeModules: CockpitModule[] = [];
	let currentCtx: ExtensionContext | undefined;
	let currentCwd = process.cwd();
	let currentCfg: CockpitConfig | undefined;

	// ── Apply config ──────────────────────────────────────────────────────────

	function applyConfig(ctx: ExtensionContext, cfg: CockpitConfig): void {
		// 1. Deactivate all currently active modules
		for (const mod of activeModules) mod.deactivate(ctx);
		activeModules = [];

		// 2. Always reset footer first (prevents orphaned footer from previous config)
		applyMinimalFooter(ctx, getInfo);

		// 3. Activate enabled modules
		function activate(mod: CockpitModule): void {
			mod.activate(ctx, cfg);
			activeModules.push(mod);
		}

		if (cfg.tabStatus)        activate(tabStatusMod);
		if (cfg.toolCounterWidget) activate(toolWidgetMod);
		if (cfg.themeCycler)      activate(themeCyclerMod);
		if (cfg.purposeGate)      activate(purposeGateMod);
		if (cfg.subagentWidget)   activate(subagentMod);
		if (cfg.tilldone)         activate(tilldoneMod);

		// 4. Apply footer (only one wins; tilldone footer needs tilldone enabled)
		const footerMode = cfg.tilldone ? cfg.footerMode : (cfg.footerMode === "tilldone" ? "minimal" : cfg.footerMode);
		switch (footerMode) {
			case "tool-counter": toolFooter.apply(ctx);                                       break;
			case "tilldone":     applyTilldoneFooter(ctx, () => tilldoneMod.getState(), getInfo); break;
			case "none":         applyNoneFooter(ctx);                                        break;
			default:             applyMinimalFooter(ctx, getInfo);                            break;
		}

		ctx.ui.setStatus("cockpit", `🎛 cockpit`);
		currentCfg = cfg;
	}

	// ── /cockpit command ──────────────────────────────────────────────────────

	pi.registerCommand("cockpit", {
		description: "Toggle cockpit settings (hot-reload): /cockpit",
		handler: async (args, ctx) => {
			currentCtx = ctx;
			if (!currentCfg) return;

			// Quick args: /cockpit footer minimal|tool-counter|tilldone|none
			//             /cockpit toggle <key>
			const parts = args.trim().split(/\s+/);
			if (parts[0] === "footer" && parts[1]) {
				const next = { ...currentCfg, footerMode: parts[1] as any };
				saveConfig(currentCwd, next);
				applyConfig(ctx, next);
				ctx.ui.notify(`Footer: ${parts[1]}`, "info");
				return;
			}
			if (parts[0] === "toggle" && parts[1]) {
				const key = parts[1] as keyof CockpitConfig;
				if (key in currentCfg && typeof (currentCfg as any)[key] === "boolean") {
					const next = { ...currentCfg, [key]: !(currentCfg as any)[key] };
					saveConfig(currentCwd, next);
					applyConfig(ctx, next);
					ctx.ui.notify(`${key}: ${(next as any)[key]}`, "info");
					return;
				}
			}
			// Full UI
			const newCfg = await showCockpitUI(ctx, currentCfg);
			if (!newCfg) { ctx.ui.notify("Cockpit: cancelled", "info"); return; }
			saveConfig(currentCwd, newCfg);
			applyConfig(ctx, newCfg);
			ctx.ui.notify("Cockpit settings applied", "info");
		},
	});

	// ── Session lifecycle ─────────────────────────────────────────────────────

	pi.on("session_start", async (_e, ctx) => {
		currentCtx = ctx;
		currentCwd = ctx.cwd;
		const cfg = loadConfig(ctx.cwd);
		applyConfig(ctx, cfg);
	});


	pi.on("session_shutdown", async (_e, ctx) => {
		for (const mod of activeModules) mod.deactivate(ctx);
		activeModules = [];
	});
}

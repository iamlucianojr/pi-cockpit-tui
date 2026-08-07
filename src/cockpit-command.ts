import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { CockpitConfig, FooterMode } from "./types.ts";

const FOOTER_MODES: FooterMode[] = ["minimal", "tool-counter", "tilldone", "none"];

/**
 * Show the /cockpit toggle UI.
 * Returns the updated config, or undefined if the user cancelled.
 */
export async function showCockpitUI(
	ctx: ExtensionContext,
	current: CockpitConfig,
): Promise<CockpitConfig | undefined> {
	const cfg = { ...current };

	// Build a flat list for ctx.ui.select
	const items = [
		// Footer section
		"── Footer mode ──────────────────────────",
		...FOOTER_MODES.map(m => `  ${cfg.footerMode === m ? "●" : "○"} footer: ${m}`),
		// Widget toggles
		"── Widgets ──────────────────────────────",
		`  ${cfg.toolCounterWidget ? "✓" : "○"} tool-counter-widget`,
		`  ${cfg.subagentWidget    ? "✓" : "○"} subagent-widget`,
		`  ${cfg.themeSwatch       ? "✓" : "○"} theme-swatch (flash on theme change)`,
		// Features
		"── Features ─────────────────────────────",
		`  ${cfg.tabStatus   ? "✓" : "○"} tab-status (terminal tab title)`,
		`  ${cfg.tilldone    ? "✓" : "○"} tilldone (task tool + widget)`,
		`  ${cfg.themeCycler ? "✓" : "○"} theme-cycler (alt+t / alt+shift+t shortcuts)`,
		`  ${cfg.purposeGate ? "✓" : "○"} purpose-gate (intent dialog)`,
		// Actions
		"── ──────────────────────────────────────",
		"  ✔  Save & Apply",
		"  ✖  Cancel",
	];

	const selected = await ctx.ui.select("🎛  Cockpit Settings", items);
	if (!selected || selected.includes("Cancel")) return undefined;
	if (selected.includes("Save & Apply")) return cfg;

	// Section headers — no-op, re-open
	if (selected.startsWith("──")) return showCockpitUI(ctx, cfg);

	// Footer mode selection
	for (const m of FOOTER_MODES) {
		if (selected.includes(`footer: ${m}`)) {
			cfg.footerMode = m;
			// tilldone footer requires tilldone feature
			if (m === "tilldone" && !cfg.tilldone) cfg.tilldone = true;
			return showCockpitUI(ctx, cfg);
		}
	}

	// Toggle booleans
	const toggleMap: Record<string, keyof CockpitConfig> = {
		"tool-counter-widget": "toolCounterWidget",
		"subagent-widget":     "subagentWidget",
		"theme-swatch":        "themeSwatch",
		"tab-status":          "tabStatus",
		"tilldone":            "tilldone",
		"theme-cycler":        "themeCycler",
		"purpose-gate":        "purposeGate",
	};
	for (const [label, key] of Object.entries(toggleMap)) {
		if (selected.includes(label)) {
			(cfg as any)[key] = !(cfg as any)[key];
			// Reset tilldone footer when tilldone is turned off
			if (key === "tilldone" && !cfg.tilldone && cfg.footerMode === "tilldone") {
				cfg.footerMode = "minimal";
			}
			return showCockpitUI(ctx, cfg);
		}
	}

	return showCockpitUI(ctx, cfg);
}

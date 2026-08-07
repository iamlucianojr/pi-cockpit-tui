import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

// ── Config ────────────────────────────────────────────────────────────────────

export type FooterMode = "none" | "minimal" | "tool-counter" | "tilldone";

export interface CockpitConfig {
	/** Footer display mode. Mutually exclusive. Default: "minimal" */
	footerMode: FooterMode;
	/** Show per-tool call count badges above the editor. Default: false */
	toolCounterWidget: boolean;
	/** Ask for session intent on start, show persistent purpose widget. Default: false */
	purposeGate: boolean;
	/** Show status widget per running subagent. Default: true */
	subagentWidget: boolean;
	/** Flash a colour swatch widget after theme changes. Default: true */
	themeSwatch: boolean;
	/** Update the terminal tab title with agent run state. Default: true */
	tabStatus: boolean;
	/** Enable task lifecycle tool, current-task widget, and /tilldone overlay. Default: false */
	tilldone: boolean;
	/** Register Ctrl+X/Q theme shortcuts and /theme command. Default: true */
	themeCycler: boolean;
}

export const DEFAULT_CONFIG: CockpitConfig = {
	footerMode: "minimal",
	toolCounterWidget: false,
	purposeGate: false,
	subagentWidget: true,
	themeSwatch: true,
	tabStatus: true,
	tilldone: false,
	themeCycler: true,
};

// ── Module interface ──────────────────────────────────────────────────────────

/**
 * A cockpit module owns one or more named UI surfaces (widgets, footer, title).
 * activate() installs them; deactivate() removes them and clears any timers.
 */
export interface CockpitModule {
	activate(ctx: ExtensionContext, cfg: CockpitConfig): void;
	deactivate(ctx: ExtensionContext): void;
}

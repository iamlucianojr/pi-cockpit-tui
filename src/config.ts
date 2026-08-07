import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_CONFIG, type CockpitConfig, type FooterMode } from "./types.ts";

const FOOTER_MODES: FooterMode[] = ["none", "minimal", "tool-counter", "tilldone"];

export function isFooterMode(v: unknown): v is FooterMode {
	return typeof v === "string" && FOOTER_MODES.includes(v as FooterMode);
}

export function merge(base: CockpitConfig, overrides: Record<string, unknown>): CockpitConfig {
	return {
		footerMode: isFooterMode(overrides.footerMode) ? overrides.footerMode : base.footerMode,
		toolCounterWidget: typeof overrides.toolCounterWidget === "boolean" ? overrides.toolCounterWidget : base.toolCounterWidget,
		purposeGate: typeof overrides.purposeGate === "boolean" ? overrides.purposeGate : base.purposeGate,
		subagentWidget: typeof overrides.subagentWidget === "boolean" ? overrides.subagentWidget : base.subagentWidget,
		themeSwatch: typeof overrides.themeSwatch === "boolean" ? overrides.themeSwatch : base.themeSwatch,
		tabStatus: typeof overrides.tabStatus === "boolean" ? overrides.tabStatus : base.tabStatus,
		tilldone: typeof overrides.tilldone === "boolean" ? overrides.tilldone : base.tilldone,
		themeCycler: typeof overrides.themeCycler === "boolean" ? overrides.themeCycler : base.themeCycler,
	};
}

function readJson(filePath: string): Record<string, unknown> {
	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return {};
	}
}

/** Load config: defaults → global (~/.pi/cockpit.json) → project (.pi/cockpit.json) */
export function loadConfig(cwd: string): CockpitConfig {
	const globalPath = path.join(os.homedir(), ".pi", "cockpit.json");
	const projectPath = path.join(cwd, ".pi", "cockpit.json");

	let cfg = { ...DEFAULT_CONFIG };
	cfg = merge(cfg, readJson(globalPath));
	cfg = merge(cfg, readJson(projectPath));

	// tilldone=false must not leave footerMode="tilldone"
	if (!cfg.tilldone && cfg.footerMode === "tilldone") {
		cfg.footerMode = "minimal";
	}

	return cfg;
}

/** Persist config to .pi/cockpit.json in the project directory */
export function saveConfig(cwd: string, cfg: CockpitConfig): void {
	const dir = path.join(cwd, ".pi");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "cockpit.json"),
		JSON.stringify(cfg, null, 2) + "\n",
		"utf-8",
	);
}

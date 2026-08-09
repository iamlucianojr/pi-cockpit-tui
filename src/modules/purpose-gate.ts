import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import type { CockpitConfig, CockpitModule } from "../types.ts";

const WIDGET_KEY = "cockpit-purpose";

// Synthwave palette
const BG  = "\x1b[48;2;74;30;106m";
const BGR = "\x1b[49m";
const PINK = "\x1b[38;2;255;126;219m";
const CYAN = "\x1b[38;2;54;249;246m";
const BOLD = "\x1b[1m";
const RESET_BOLD = "\x1b[22m";
const FGR = "\x1b[39m";

export function createPurposeGateModule(pi: ExtensionAPI): CockpitModule {
	let purpose: string | undefined;
	let enabled = false;

	async function askForPurpose(ctx: ExtensionContext): Promise<void> {
		const answer = await ctx.ui.input(
			"What is the purpose of this session?",
			"e.g. Refactor the auth module to use JWT",
		);
		// Cancelling must not trap the session: the input handler below blocks all
		// input while the gate is armed, so a refused prompt disarms the gate.
		if (!answer?.trim()) {
			enabled = false;
			ctx.ui.notify("Purpose gate skipped. Re-arm with /cockpit toggle purposeGate.", "info");
			return;
		}
		purpose = answer.trim();

		ctx.ui.setWidget(WIDGET_KEY, () => ({
			render(width: number): string[] {
				const pad = BG + " ".repeat(width) + BGR;
				const label = PINK + BOLD + "  PURPOSE: " + RESET_BOLD + FGR;
				const msg = CYAN + BOLD + purpose! + RESET_BOLD + FGR;
				const content = BG + truncateToWidth(label + msg + " ".repeat(width), width, "") + BGR;
				return [pad, content, pad];
			},
			invalidate() {},
		}));
	}

	pi.on("before_agent_start", async (event) => {
		if (!enabled || !purpose) return;
		return {
			systemPrompt: (event as any).systemPrompt +
				`\n\n<purpose>\nYour singular purpose this session: ${purpose}\nStay focused. If a request drifts, gently remind the user.\n</purpose>`,
		};
	});

	pi.on("input", async (_event, ctx) => {
		if (!enabled || purpose) return { action: "continue" as const };
		ctx.ui.notify("Set a purpose first.", "warning");
		return { action: "handled" as const };
	});

	return {
		activate(ctx, _cfg: CockpitConfig): void {
			enabled = true;
			if (!purpose) void askForPurpose(ctx);
		},
		deactivate(ctx): void {
			enabled = false;
			ctx.ui.setWidget(WIDGET_KEY, undefined);
		},
	};
}

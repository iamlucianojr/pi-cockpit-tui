import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Shared session-info source for the footers.
 *
 * Tracks the active workon project (via `workon:switch` event bus) and
 * exposes a single `getSessionInfo(ctx)` that footers call on each render
 * to pull provider / project / session-name in one place.
 */

let activeProjectName: string | undefined;
let activeProjectPath: string | undefined;
let busSubscribed = false;

function ensureBusSubscribed(pi: ExtensionAPI): void {
	if (busSubscribed) return;
	busSubscribed = true;
	pi.events.on("workon:switch", (data: any) => {
		activeProjectName = data?.name;
		activeProjectPath = data?.path;
	});
}

export interface SessionInfo {
	provider: string | undefined;
	model: string;
	project: string | undefined;
	projectPath: string | undefined;
	sessionName: string | undefined;
}

export function createSessionInfoSource(pi: ExtensionAPI): {
	get(ctx: ExtensionContext): SessionInfo;
} {
	ensureBusSubscribed(pi);
	return {
		get(ctx: ExtensionContext): SessionInfo {
			return {
				provider: ctx.model?.provider as string | undefined,
				model: ctx.model?.id ?? "no-model",
				project: activeProjectName,
				projectPath: activeProjectPath,
				sessionName: pi.getSessionName?.(),
			};
		},
	};
}

/**
 * Context-usage progress bar, shared by every footer.
 *
 * Lives on its own because duplicating it is how one footer ended up with a
 * clamp and the other without: `String.repeat` throws on a negative count, so
 * an unclamped bar crashes the render as soon as context usage passes 100%.
 */
export function renderBar(pct: number, width = 10): string {
	const filled = Math.min(width, Math.max(0, Math.round((pct || 0) / (100 / width))));
	return "#".repeat(filled) + "-".repeat(width - filled);
}

/** Filled-cell count only, for footers that colour the two halves separately. */
export function barFilled(pct: number, width = 10): number {
	return Math.min(width, Math.max(0, Math.round((pct || 0) / (100 / width))));
}

/**
 * Custom fork: an icon of its own. Upstream used Lucide's `git-fork`, which is
 * also the Graph view's icon, so the two sat side by side in the ribbon looking
 * identical. This one is a root with two branches on each side.
 */
import { addIcon } from "obsidian";

export const MINDMAP_ICON = "mindmap-mode-custom";

// Obsidian icons are drawn in a 100x100 box; strokes follow the theme colour.
const SVG = [
	'<g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">',
	'<rect x="32" y="39" width="36" height="22" rx="7"/>',
	'<path d="M68 50 C 78 50, 76 22, 86 22 H 94"/>',
	'<path d="M68 50 C 78 50, 76 78, 86 78 H 94"/>',
	'<path d="M32 50 C 22 50, 24 22, 14 22 H 6"/>',
	'<path d="M32 50 C 22 50, 24 78, 14 78 H 6"/>',
	"</g>",
].join("");

export function registerMindmapIcon(): void {
	addIcon(MINDMAP_ICON, SVG);
}

/**
 * Custom fork: free left/right placement of top-level branches.
 *
 * The note order stays the map's reading order -- the right side top to bottom,
 * then the left side top to bottom -- so any arrangement is fully described by
 * that order plus one number: how many branches sit on the right (the split).
 * Moving a branch is therefore "reorder the note, then store the new split".
 * The split is stored as a `SideSplit` -- which branch starts the left side --
 * so it keeps meaning the same thing when branches come and go.
 *
 * Pure, so it is tested without Obsidian or a DOM.
 */
import type { SideSplit } from "../foldStore.ts";

/** The split `right` describes, over the top-level branch keys in note order. */
export function encodeSplit(root: string, keys: readonly string[], right: number): SideSplit {
	const at = Math.max(0, Math.min(Math.floor(right), keys.length));
	return { root, firstLeft: keys[at] ?? null, right: at, total: keys.length };
}

/**
 * How many of `keys` go on the right under `saved`, or undefined to split by
 * weight.
 *
 * The first left branch is followed wherever it now is, so adding, removing or
 * reordering branches keeps the sides as the user left them. When that branch
 * is gone, the saved count still applies if only names changed (same root, same
 * number of branches); anything bigger -- a new root, branches added and
 * renamed at once -- is a different map, and a stale count would scatter it.
 */
export function resolveSplit(
	root: string,
	keys: readonly string[],
	saved: SideSplit | undefined,
): number | undefined {
	if (!saved) return undefined;
	if (saved.firstLeft !== null) {
		const at = keys.indexOf(saved.firstLeft);
		if (at >= 0) return at;
	}
	if (saved.root !== root) return undefined;
	if (saved.firstLeft === null) return keys.length;
	return saved.total === keys.length ? Math.min(saved.right, keys.length) : undefined;
}

export type SideSign = 1 | -1;

export interface Placement {
	/** Top-level ids in their new note order. */
	order: string[];
	/** How many of `order` go on the right. */
	split: number;
	/**
	 * Where to write the moved node in the note: beside an existing top-level
	 * branch, or null when it is the only one (append under the root).
	 */
	anchor: { targetId: string; mode: "before" | "after" } | null;
}

/**
 * Put `id` at `index` within `side`, given the current top-level ids per side
 * in display order. `id` may already be on either side, or come from deeper in
 * the tree.
 *
 * `anchorable` says which ids can be written beside: body cards count for the
 * split (the layout splits them like any branch) but have no line of their own
 * to move next to, so the anchor skips over them.
 */
export function placeOnSide(
	right: readonly string[],
	left: readonly string[],
	id: string,
	side: SideSign,
	index: number,
	anchorable: (candidate: string) => boolean = () => true,
): Placement {
	const r = right.filter((x) => x !== id);
	const l = left.filter((x) => x !== id);
	const group = side === 1 ? r : l;
	const at = Math.max(0, Math.min(Math.floor(index), group.length));
	const placed = [...group.slice(0, at), id, ...group.slice(at)];

	const newRight = side === 1 ? placed : r;
	const newLeft = side === 1 ? l : placed;
	const order = [...newRight, ...newLeft];
	const position = order.indexOf(id);
	const next = order.slice(position + 1).find(anchorable);
	const previous = order.slice(0, position).reverse().find(anchorable);

	let anchor: Placement["anchor"] = null;
	if (next !== undefined) anchor = { targetId: next, mode: "before" };
	else if (previous !== undefined) anchor = { targetId: previous, mode: "after" };

	return { order, split: newRight.length, anchor };
}

export interface Box {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

export interface SideCard extends Box {
	id: string;
	side: SideSign;
}

/**
 * How far past the root an empty side still takes a drop, in screen pixels.
 * A side with branches reaches as far as its widest first-level card instead.
 */
const EMPTY_SIDE_REACH_PX = 200;

/**
 * Which side, and where on it, a pointer in open canvas near the root means.
 *
 * Only the first-level column counts: from the root's edge out to the far edge
 * of that side's first-level cards. Anywhere else is not a slot, so open canvas
 * among deeper branches still moves nothing.
 */
export function sideSlot(
	root: Box,
	cards: readonly SideCard[],
	x: number,
	y: number,
): { side: SideSign; index: number } | null {
	let side: SideSign;
	if (x > root.right) side = 1;
	else if (x < root.left) side = -1;
	else return null;

	const own = cards
		.filter((c) => c.side === side)
		.sort((a, b) => a.top - b.top);

	const reach =
		own.length === 0
			? EMPTY_SIDE_REACH_PX
			: side === 1
				? Math.max(...own.map((c) => c.right)) - root.right
				: root.left - Math.min(...own.map((c) => c.left));
	const distance = side === 1 ? x - root.right : root.left - x;
	if (distance > reach) return null;

	const index = own.findIndex((c) => y < (c.top + c.bottom) / 2);
	return { side, index: index === -1 ? own.length : index };
}

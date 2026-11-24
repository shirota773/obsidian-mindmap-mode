/**
 * Custom fork: where a dragged card lands, worked out from screen-space boxes.
 *
 * Pure so it can be tested without a DOM: the caller measures the cards and
 * hands their rects in.
 */

/** "first-child" is only offered on the root, whose top half means "put it first". */
export type DropMode = "child" | "before" | "after" | "first-child";

export interface CardBox {
	id: string;
	left: number;
	right: number;
	top: number;
	bottom: number;
}

export interface GapHit {
	id: string;
	mode: "before" | "after";
}

/** Upstream's edge band: 30% of the card, at most 14px. */
const EDGE_RATIO = 0.3;
const EDGE_MAX_PX = 14;

/**
 * How far above or below a card a pointer in the gap still counts as "beside
 * it", as a share of that card's height. Scaling with the card keeps the reach
 * the same on screen at any zoom. 0.75 of a 24px list card is 18px, which
 * covers the default 14px gap between siblings with room to spare.
 */
const GAP_REACH_RATIO = 0.75;

/** Which part of a card the pointer is over. */
export function zoneOfCard(box: CardBox, clientY: number, isRoot: boolean): DropMode {
	if (isRoot) {
		// The root has no siblings, so its edges cannot mean before/after. Split
		// it in half instead: dropping on the top half puts the node first.
		return clientY < (box.top + box.bottom) / 2 ? "first-child" : "child";
	}
	const edge = Math.min((box.bottom - box.top) * EDGE_RATIO, EDGE_MAX_PX);
	if (clientY < box.top + edge) return "before";
	if (clientY > box.bottom - edge) return "after";
	return "child";
}

/**
 * The card a pointer in empty space between cards is beside, if any.
 *
 * Only cards spanning the pointer horizontally are considered, so a gap in one
 * column never resolves to a card in the next. Past the reach nothing is
 * returned: a drop on open canvas must not move anything.
 */
export function nearestInGap(
	cards: readonly CardBox[],
	clientX: number,
	clientY: number,
	excludeId: string | null,
): GapHit | null {
	let best: GapHit | null = null;
	let bestDistance = Infinity;

	for (const box of cards) {
		if (box.id === excludeId) continue;
		if (clientX < box.left || clientX > box.right) continue;

		const above = box.top - clientY;
		const below = clientY - box.bottom;
		const distance = above > 0 ? above : below > 0 ? below : 0;
		if (distance === 0) continue; // On the card itself: zoneOfCard's job.

		const reach = (box.bottom - box.top) * GAP_REACH_RATIO;
		if (distance > reach || distance >= bestDistance) continue;

		bestDistance = distance;
		best = { id: box.id, mode: above > 0 ? "before" : "after" };
	}
	return best;
}

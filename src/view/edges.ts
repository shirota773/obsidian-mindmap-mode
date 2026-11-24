import type { LayoutNode } from "../layout/tidyTree.ts";
import { edgeInView } from "./culling.ts";
import type { ViewBox } from "./culling.ts";

/**
 * A little more than the widest stroke, so culling never drops a curve that its
 * own line width, round cap included, would still have put on screen.
 */
const STROKE_PAD = 4;

/**
 * Where a connector meets a node: the middle of the card's face.
 *
 * The card, never the node box. An annotation hangs below the card without
 * being part of it, so a `height/2` here would slide the connector down the
 * side of an annotated card and leave it pointing at nothing.
 */
export function anchorFor(n: LayoutNode, outgoing: boolean, side: number): [number, number] {
	const y = n.y + n.cardHeight / 2;
	// Outgoing edges leave the face pointing at the children; incoming edges
	// arrive on the opposite face.
	const rightFace = outgoing ? side === 1 : side !== 1;
	return [rightFace ? n.x + n.cardWidth : n.x, y];
}

function strokeWidth(depth: number): number {
	if (depth <= 1) return 3;
	if (depth === 2) return 2;
	return 1.4;
}

/**
 * Draw the connector layer.
 *
 * The organic S-curve is what reads as "mind map" rather than "org chart":
 * a cubic bezier whose control points sit halfway between the two anchors.
 *
 * `view` is the part of the map worth drawing; pass null for all of it. Both
 * control points share their x range with the two anchors and their y with one
 * or the other, so the anchors' bounding box contains the whole curve and a
 * cheap rectangle test is exact rather than approximate.
 *
 * Returns how many paths it drew, which is what a redraw costs.
 */
export function renderEdges(
	svg: SVGSVGElement,
	nodes: LayoutNode[],
	width: number,
	height: number,
	branchColors: boolean,
	view: ViewBox | null = null,
): number {
	svg.replaceChildren();
	svg.setAttribute("width", String(width));
	svg.setAttribute("height", String(height));
	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

	// Built off-tree and attached once: appending a few hundred paths straight
	// into a live SVG invalidates the layer that many times over.
	const frag = createFragment();
	let drawn = 0;

	for (const child of nodes) {
		const parent = child.parent;
		if (!parent) continue;

		const [px, py] = anchorFor(parent, true, child.side);
		const [cx, cy] = anchorFor(child, false, child.side);
		if (view && !edgeInView(px, py, cx, cy, STROKE_PAD, view)) continue;
		const dx = (cx - px) * 0.5;

		const path = createSvg("path");
		path.setAttribute(
			"d",
			`M ${px} ${py} C ${px + dx} ${py}, ${cx - dx} ${cy}, ${cx} ${cy}`,
		);
		path.setAttribute("fill", "none");
		path.setAttribute("stroke-width", String(strokeWidth(child.depth)));
		path.setAttribute("stroke-linecap", "round");
		path.addClass("mm-edge");
		if (branchColors && child.branch >= 0) {
			path.dataset.branch = String(child.branch % 10);
		}
		frag.appendChild(path);
		drawn++;
	}

	svg.appendChild(frag);
	return drawn;
}

/** Detached: the caller attaches the finished layer along with the cards. */
export function createEdgeLayer(): SVGSVGElement {
	const svg = createSvg("svg");
	svg.addClass("mm-edges");
	return svg;
}

// --- custom fork: relation lines -------------------------------------------------

export interface CardRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface RelationGeometry {
	start: [number, number];
	end: [number, number];
	control: [number, number];
	/** The curve's midpoint, where the label goes. */
	label: [number, number];
	d: string;
}

/** Share of the distance between the two ends that the curve bows out by. */
const RELATION_BOW = 0.18;

/** Where the line from the card's centre towards `toward` crosses its border. */
function borderPoint(r: CardRect, toward: [number, number]): [number, number] {
	const cx = r.x + r.w / 2;
	const cy = r.y + r.h / 2;
	const dx = toward[0] - cx;
	const dy = toward[1] - cy;
	if (dx === 0 && dy === 0) return [cx, cy];
	const scale = Math.min(
		dx === 0 ? Infinity : r.w / 2 / Math.abs(dx),
		dy === 0 ? Infinity : r.h / 2 / Math.abs(dy),
	);
	return [cx + dx * scale, cy + dy * scale];
}

/**
 * A relation's curve: border to border, bowed to one side of the straight line
 * so that a relation between parent and child never hides under the tree's own
 * connector. A quadratic bezier, so its midpoint (for the label) is exact.
 */
export function relationGeometry(from: CardRect, to: CardRect): RelationGeometry {
	const fromCentre: [number, number] = [from.x + from.w / 2, from.y + from.h / 2];
	const toCentre: [number, number] = [to.x + to.w / 2, to.y + to.h / 2];
	const start = borderPoint(from, toCentre);
	const end = borderPoint(to, fromCentre);

	const mx = (start[0] + end[0]) / 2;
	const my = (start[1] + end[1]) / 2;
	const dx = end[0] - start[0];
	const dy = end[1] - start[1];
	// Perpendicular, always bowing "up" for a left-to-right line.
	const control: [number, number] = [mx + dy * RELATION_BOW, my - dx * RELATION_BOW];
	const label: [number, number] = [
		0.25 * start[0] + 0.5 * control[0] + 0.25 * end[0],
		0.25 * start[1] + 0.5 * control[1] + 0.25 * end[1],
	];
	const r = (n: number): number => Math.round(n * 10) / 10;
	const d = `M ${r(start[0])} ${r(start[1])} Q ${r(control[0])} ${r(control[1])}, ${r(end[0])} ${r(end[1])}`;
	return { start, end, control, label, d };
}

let markerSerial = 0;

/**
 * Draw relation lines on top of the connectors already in `svg`.
 *
 * Relations are few, so they are not culled. A relation whose end is folded
 * away is simply not drawn.
 */
export function renderRelations(
	svg: SVGSVGElement,
	relations: ReadonlyArray<{ fromId: string; toId: string; label: string | null }>,
	byId: ReadonlyMap<string, LayoutNode>,
): number {
	if (relations.length === 0) return 0;
	// One marker per layer: marker ids are document-global, and two open maps
	// must not share (and so restyle) each other's arrowheads.
	const markerId = `mm-relation-arrow-${++markerSerial}`;
	const defs = createSvg("defs");
	const marker = createSvg("marker");
	marker.setAttribute("id", markerId);
	marker.setAttribute("viewBox", "0 0 10 10");
	marker.setAttribute("refX", "9");
	marker.setAttribute("refY", "5");
	marker.setAttribute("markerWidth", "7");
	marker.setAttribute("markerHeight", "7");
	marker.setAttribute("orient", "auto-start-reverse");
	const tip = createSvg("path");
	tip.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
	tip.addClass("mm-relation-arrow");
	marker.appendChild(tip);
	defs.appendChild(marker);

	const frag = createFragment();
	frag.appendChild(defs);
	let drawn = 0;
	relations.forEach((rel, index) => {
		const a = byId.get(rel.fromId);
		const b = byId.get(rel.toId);
		if (!a || !b) return;
		const g = relationGeometry(
			{ x: a.x, y: a.y, w: a.cardWidth, h: a.cardHeight },
			{ x: b.x, y: b.y, w: b.cardWidth, h: b.cardHeight },
		);
		// One group per relation, carrying its index: the line, a wide invisible
		// stroke that is what the pointer actually hits, and the label.
		const group = createSvg("g");
		group.addClass("mm-relation-group");
		group.setAttribute("data-relation", String(index));
		const path = createSvg("path");
		path.setAttribute("d", g.d);
		path.setAttribute("fill", "none");
		path.setAttribute("marker-end", `url(#${markerId})`);
		path.addClass("mm-relation");
		group.appendChild(path);
		const hit = createSvg("path");
		hit.setAttribute("d", g.d);
		hit.setAttribute("fill", "none");
		hit.addClass("mm-relation-hit");
		group.appendChild(hit);
		frag.appendChild(group);
		if (rel.label) {
			const text = createSvg("text");
			text.setAttribute("x", String(Math.round(g.label[0])));
			text.setAttribute("y", String(Math.round(g.label[1])));
			text.setAttribute("text-anchor", "middle");
			text.setAttribute("dominant-baseline", "middle");
			text.addClass("mm-relation-label");
			text.textContent = rel.label;
			group.appendChild(text);
		}
		drawn++;
	});
	svg.appendChild(frag);
	return drawn;
}

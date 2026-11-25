/**
 * Custom fork: several maps on one canvas, each placed where the user put it.
 *
 * A note with more than one `# ` heading is drawn as one map per heading
 * instead of hanging them all off the file name. Each map is laid out on its
 * own; this module decides where each one goes: where it was saved, or below
 * the others when it is new.
 *
 * A position is the top-left of the map's root card, in "map space" -- the
 * canvas before the view shifts everything into positive coordinates -- so it
 * stays put while branches grow on either side of the root.
 *
 * Pure, so it is tested without Obsidian or a DOM.
 */
import type { SavedMapPosition } from "../foldStore.ts";
import { layoutTree } from "../layout/tidyTree.ts";
import type { LayoutNode, LayoutOptions, LayoutResult } from "../layout/tidyTree.ts";

/** Space between a new map and the lowest one already on the canvas. */
export const MAP_GAP = 80;

/** One map as laid out on its own: its root card and the box around it all. */
export interface MapGeometry {
	/** What the map is known by: its root's title, "(file)", or "ext:<path>". */
	name: string;
	rootX: number;
	rootY: number;
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface Point {
	x: number;
	y: number;
}

/**
 * Where each map's root card goes. Saved positions are matched by name; when
 * no name matches but the number of maps is what it was, by order (a map was
 * renamed). Whatever is still unplaced stacks below the lowest placed map.
 */
export function placeMaps(
	maps: readonly MapGeometry[],
	saved: readonly SavedMapPosition[] | undefined,
	gap: number,
): Point[] {
	const known = saved ?? [];
	const sameCount = known.length === maps.length;
	const out: Array<Point | null> = maps.map((m, i) => {
		const hit = known.find((s) => s.root === m.name) ?? (sameCount ? known[i] : undefined);
		return hit ? { x: hit.x, y: hit.y } : null;
	});

	let anchorX: number | null = null;
	let bottom: number | null = null;
	const extend = (m: MapGeometry, p: Point): void => {
		const b = p.y + (m.bottom - m.rootY);
		bottom = bottom === null ? b : Math.max(bottom, b);
		if (anchorX === null) anchorX = p.x;
	};
	maps.forEach((m, i) => {
		const p = out[i];
		if (p) extend(m, p);
	});
	maps.forEach((m, i) => {
		if (out[i]) return;
		const p: Point =
			bottom === null
				? { x: 0, y: 0 }
				: { x: anchorX ?? 0, y: bottom + gap + (m.rootY - m.top) };
		out[i] = p;
		extend(m, p);
	});
	return out as Point[];
}

/** One map to lay out: its root, what it is known by, and its own left/right split. */
export interface ForestMap {
	root: LayoutNode;
	name: string;
	split?: number;
}

export interface ForestLayout extends LayoutResult {
	/** Where every map ended up, in map space, ready to be saved. */
	positions: SavedMapPosition[];
	/** What was added to map space to make every coordinate positive. */
	shift: Point;
}

/**
 * Lay each map out on its own, put it where it belongs, and shift the lot so
 * the canvas starts at `padding`. A child flagged `mapRoot` is a map of its own
 * and is left out of its parent's layout. `ghost` is a root kept in the tree but
 * not shown (the file name, when every branch is a map of its own); it is parked
 * on the first map's root so it never widens the canvas.
 */
export function layoutForest(
	maps: readonly ForestMap[],
	base: Omit<LayoutOptions, "split">,
	saved: readonly SavedMapPosition[] | undefined,
	ghost: LayoutNode | null,
): ForestLayout {
	const laid = maps.map((m) => {
		const all = m.root.children;
		m.root.children = all.filter((c) => !c.mapRoot);
		let nodes: LayoutNode[];
		try {
			nodes = layoutTree(m.root, { ...base, split: m.split }).nodes;
		} finally {
			m.root.children = all;
		}
		const box = boundsOf(nodes);
		const geometry: MapGeometry = { name: m.name, rootX: m.root.x, rootY: m.root.y, ...box };
		return { map: m, nodes, geometry };
	});

	const places = placeMaps(laid.map((l) => l.geometry), saved, MAP_GAP);
	const nodes: LayoutNode[] = [];
	laid.forEach((l, i) => {
		const dx = places[i].x - l.map.root.x;
		const dy = places[i].y - l.map.root.y;
		for (const n of l.nodes) {
			n.x += dx;
			n.y += dy;
			nodes.push(n);
		}
	});

	const box = nodes.length > 0 ? boundsOf(nodes) : { left: 0, top: 0, right: 0, bottom: 0 };
	const shift = { x: base.padding - box.left, y: base.padding - box.top };
	for (const n of nodes) {
		n.x += shift.x;
		n.y += shift.y;
	}
	if (ghost) {
		const first = maps[0]?.root;
		ghost.x = first ? first.x : base.padding;
		ghost.y = first ? first.y : base.padding;
		nodes.push(ghost);
	}

	return {
		width: box.right - box.left + base.padding * 2,
		height: box.bottom - box.top + base.padding * 2,
		nodes,
		positions: maps.map((m, i) => ({ root: m.name, x: places[i].x, y: places[i].y })),
		shift,
	};
}

function boundsOf(nodes: readonly LayoutNode[]): { left: number; top: number; right: number; bottom: number } {
	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	for (const n of nodes) {
		left = Math.min(left, n.x);
		top = Math.min(top, n.y);
		right = Math.max(right, n.x + n.width);
		bottom = Math.max(bottom, n.y + n.height);
	}
	return { left, top, right, bottom };
}

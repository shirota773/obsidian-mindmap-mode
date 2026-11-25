import { test } from "node:test";
import assert from "node:assert/strict";

import { layoutForest, placeMaps } from "./forest.ts";
import { createLayoutNode } from "../layout/tidyTree.ts";
import type { LayoutNode } from "../layout/tidyTree.ts";
import type { MindNode } from "../model/types.ts";
import type { MapGeometry } from "./forest.ts";

// A map is its root card plus the box of everything it draws, in its own frame.
function map(name: string, height: number): MapGeometry {
	return { name, rootX: 100, rootY: height / 2 - 20, left: 0, top: 0, right: 400, bottom: height };
}

test("with nothing saved, the first map sits at the origin and the rest stack below", () => {
	const out = placeMaps([map("A", 200), map("B", 100), map("C", 50)], undefined, 80);
	assert.deepEqual(out[0], { x: 0, y: 0 });
	// A spans y -80..120 around its root; B's box starts 80 below that.
	assert.deepEqual(out[1], { x: 0, y: 120 + 80 + (50 - 20) });
	// B reaches 70 below its root.
	assert.deepEqual(out[2], { x: 0, y: out[1].y + 70 + 80 + (25 - 20) });
});

test("a saved position is found by the map's name, wherever it now is", () => {
	const saved = [{ root: "B", x: 500, y: -300 }];
	const out = placeMaps([map("A", 200), map("B", 100)], saved, 80);
	assert.deepEqual(out[1], { x: 500, y: -300 });
	// A has no place of its own, so it stacks below B (whose box ends at -230).
	assert.deepEqual(out[0], { x: 500, y: -230 + 80 + 80 });
});

test("a renamed map keeps its place when the number of maps is unchanged", () => {
	const saved = [{ root: "A", x: 0, y: 0 }, { root: "B", x: 700, y: 40 }];
	const out = placeMaps([map("A", 200), map("B2", 100)], saved, 80);
	assert.deepEqual(out[1], { x: 700, y: 40 });
});

test("a new map goes below everything that is already placed", () => {
	const saved = [{ root: "A", x: 0, y: 0 }, { root: "B", x: 0, y: 600 }];
	const out = placeMaps([map("A", 200), map("B", 100), map("new", 100)], saved, 80);
	// B's box bottom: 600 - (50 - 20) + 100 = 670.
	assert.deepEqual(out[2], { x: 0, y: 670 + 80 + 30 });
});

function sized(name: string, parent: LayoutNode | null): LayoutNode {
	const n = createLayoutNode({ id: name, key: name } as MindNode, parent, parent ? parent.depth + 1 : 0);
	n.width = n.cardWidth = 80;
	n.height = n.cardHeight = 30;
	parent?.children.push(n);
	return n;
}

const BASE = { mode: "balanced" as const, horizontalGap: 40, verticalGap: 10, padding: 60 };

test("each map is laid out on its own and placed where it was saved", () => {
	const ghost = sized("file", null);
	const a = sized("A", ghost);
	a.mapRoot = true;
	sized("a1", a);
	const b = sized("B", ghost);
	b.mapRoot = true;
	sized("b1", b);

	const out = layoutForest(
		[{ root: a, name: "A" }, { root: b, name: "B" }],
		BASE,
		[{ root: "A", x: 0, y: 0 }, { root: "B", x: 500, y: 0 }],
		ghost,
	);
	assert.deepEqual(out.positions, [{ root: "A", x: 0, y: 0 }, { root: "B", x: 500, y: 0 }]);
	// Side by side at the same height, 500 apart, and the whole canvas starts at the padding.
	assert.equal(b.x - a.x, 500);
	assert.equal(b.y, a.y);
	assert.equal(Math.min(...out.nodes.filter((n) => n !== ghost).map((n) => n.x)), 60);
	// The ghost is parked on the first map's root and its children stay attached.
	assert.equal(ghost.x, a.x);
	assert.equal(ghost.children.length, 2);
});

test("the shift says how map space was moved onto the canvas", () => {
	const a = sized("A", null);
	const out = layoutForest([{ root: a, name: "A" }], BASE, [{ root: "A", x: -200, y: 90 }], null);
	assert.deepEqual(out.shift, { x: 60 + 200, y: 60 - 90 });
	assert.equal(a.x, 60);
});

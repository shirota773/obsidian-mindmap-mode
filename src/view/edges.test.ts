import { test } from "node:test";
import assert from "node:assert/strict";

import { anchorFor, relationGeometry } from "./edges.ts";
import type { LayoutNode } from "../layout/tidyTree.ts";

/**
 * Just enough of a laid-out node to anchor a connector to. The rest of
 * `edges.ts` needs a document; the anchor is arithmetic, and the arithmetic is
 * the part that has to know a card from a node box.
 */
function placed(x: number, y: number, cardHeight: number, annotation: number): LayoutNode {
	return {
		x,
		y,
		cardWidth: 120,
		cardHeight,
		width: 120,
		height: cardHeight + annotation,
	} as LayoutNode;
}

test("a connector meets the middle of the card's face", () => {
	const node = placed(100, 200, 40, 0);
	assert.deepEqual(anchorFor(node, true, 1), [220, 220]);
	assert.deepEqual(anchorFor(node, false, 1), [100, 220]);
});

test("an annotation below the card does not drag the anchor down with it", () => {
	const plain = placed(100, 200, 40, 0);
	const annotated = placed(100, 200, 40, 120);
	for (const outgoing of [true, false]) {
		for (const side of [1, -1]) {
			assert.deepEqual(
				anchorFor(annotated, outgoing, side),
				anchorFor(plain, outgoing, side),
			);
		}
	}
});

test("an outgoing edge leaves the face the branch grows from", () => {
	const node = placed(100, 200, 40, 60);
	// Right-hand branch: out of the right face, in at the left.
	assert.deepEqual(anchorFor(node, true, 1), [220, 220]);
	assert.deepEqual(anchorFor(node, false, 1), [100, 220]);
	// Mirrored on the left of the root.
	assert.deepEqual(anchorFor(node, true, -1), [100, 220]);
	assert.deepEqual(anchorFor(node, false, -1), [220, 220]);
});

// --- custom fork: relation curves ---------------------------------------------


test("a relation leaves and enters at the card borders, not the centres (custom fork)", () => {
	const from = { x: 0, y: 0, w: 100, h: 40 };
	const to = { x: 300, y: 0, w: 100, h: 40 };
	const g = relationGeometry(from, to);
	assert.equal(g.start[0], 100); // right edge of `from`
	assert.equal(g.start[1], 20);
	assert.equal(g.end[0], 300); // left edge of `to`
	assert.equal(g.end[1], 20);
});

test("a relation bows to one side so it does not lie on the tree's own connector (custom fork)", () => {
	const g = relationGeometry({ x: 0, y: 0, w: 100, h: 40 }, { x: 300, y: 0, w: 100, h: 40 });
	assert.notEqual(g.control[1], 20);
	// The label sits on the curve's midpoint, between the two ends.
	assert.ok(g.label[0] > 100 && g.label[0] < 300);
	assert.ok(g.d.startsWith("M 100 20 Q "));
});

test("a vertical relation leaves through the bottom and enters through the top (custom fork)", () => {
	const g = relationGeometry({ x: 0, y: 0, w: 100, h: 40 }, { x: 0, y: 200, w: 100, h: 40 });
	assert.deepEqual(g.start, [50, 40]);
	assert.deepEqual(g.end, [50, 200]);
});

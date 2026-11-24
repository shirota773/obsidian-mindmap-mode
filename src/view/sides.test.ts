import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { encodeSplit, placeOnSide, resolveSplit, sideSlot } from "./sides.ts";
import type { SideCard } from "./sides.ts";

describe("placeOnSide", () => {
	const right = ["a", "b"];
	const left = ["c", "d"];

	test("moves a right branch to the top of the left side", () => {
		assert.deepEqual(placeOnSide(right, left, "a", -1, 0), {
			order: ["b", "a", "c", "d"],
			split: 1,
			anchor: { targetId: "c", mode: "before" },
		});
	});

	test("moves a left branch to the end of the right side", () => {
		assert.deepEqual(placeOnSide(right, left, "d", 1, 2), {
			order: ["a", "b", "d", "c"],
			split: 3,
			anchor: { targetId: "c", mode: "before" },
		});
	});

	test("reorders within one side without changing the split", () => {
		const out = placeOnSide(right, left, "b", 1, 0);
		assert.deepEqual(out.order, ["b", "a", "c", "d"]);
		assert.equal(out.split, 2);
		assert.deepEqual(out.anchor, { targetId: "a", mode: "before" });
	});

	test("appending to the bottom of the left side anchors after the last branch", () => {
		const out = placeOnSide(right, left, "a", -1, 2);
		assert.deepEqual(out.order, ["b", "c", "d", "a"]);
		assert.equal(out.split, 1);
		assert.deepEqual(out.anchor, { targetId: "d", mode: "after" });
	});

	test("a node from deeper in the tree joins the side as a new branch", () => {
		const out = placeOnSide(right, left, "x", 1, 1);
		assert.deepEqual(out.order, ["a", "x", "b", "c", "d"]);
		assert.equal(out.split, 3);
		assert.deepEqual(out.anchor, { targetId: "b", mode: "before" });
	});

	test("the first branch of an empty map has nothing to anchor to", () => {
		const out = placeOnSide([], [], "x", -1, 0);
		assert.deepEqual(out, { order: ["x"], split: 0, anchor: null });
	});

	test("anchors only to nodes that can be written beside (body cards cannot)", () => {
		// "p" is an intro paragraph card: counted for the split, never an anchor.
		const out = placeOnSide(["p", "a"], ["b"], "b", 1, 0, (id) => id !== "p");
		assert.deepEqual(out.order, ["b", "p", "a"]);
		assert.equal(out.split, 3);
		assert.deepEqual(out.anchor, { targetId: "a", mode: "before" });
	});

	test("an index past the end of a side is clamped", () => {
		assert.equal(placeOnSide(right, left, "c", 1, 99).split, 3);
	});
});

describe("sideSlot", () => {
	const root = { left: 400, right: 480, top: 300, bottom: 336 };
	const cards: SideCard[] = [
		{ id: "a", side: 1, left: 540, right: 600, top: 200, bottom: 230 },
		{ id: "b", side: 1, left: 540, right: 600, top: 260, bottom: 290 },
		{ id: "c", side: -1, left: 280, right: 340, top: 300, bottom: 330 },
	];

	test("a pointer right of the root, between two branches, slots between them", () => {
		assert.deepEqual(sideSlot(root, cards, 560, 250), { side: 1, index: 1 });
	});

	test("a pointer left of the root, below its branches, goes to the end of the left", () => {
		assert.deepEqual(sideSlot(root, cards, 300, 400), { side: -1, index: 1 });
	});

	test("an empty side still accepts a drop next to the root", () => {
		const rightOnly = cards.filter((c) => c.side === 1);
		assert.deepEqual(sideSlot(root, rightOnly, 350, 320), { side: -1, index: 0 });
	});

	test("a pointer far beyond the first-level column is not a slot", () => {
		assert.equal(sideSlot(root, cards, 900, 250), null);
		assert.equal(sideSlot(root, cards, 50, 250), null);
	});

	test("a pointer over the root itself is not a slot", () => {
		assert.equal(sideSlot(root, cards, 440, 320), null);
	});
});

describe("resolveSplit / encodeSplit", () => {
	const keys = ["/h:a", "/h:b", "/h:c", "/h:d"];
	const saved = encodeSplit("テーマ", keys, 3); // a b c | d

	test("records the first left branch, the count and the total", () => {
		assert.deepEqual(saved, { root: "テーマ", firstLeft: "/h:d", right: 3, total: 4 });
		assert.deepEqual(encodeSplit("テーマ", keys, 4).firstLeft, null);
	});

	test("nothing saved means split by weight", () => {
		assert.equal(resolveSplit("テーマ", keys, undefined), undefined);
	});

	test("follows the first left branch when branches are added or removed", () => {
		assert.equal(resolveSplit("テーマ", ["/h:a", "/h:b", "/h:c", "/h:d", "/h:e"], saved), 3);
		assert.equal(resolveSplit("テーマ", ["/h:x", "/h:a", "/h:b", "/h:c", "/h:d"], saved), 4);
		assert.equal(resolveSplit("テーマ", ["/h:a", "/h:c", "/h:d"], saved), 2);
	});

	test("falls back to the count when only a name changed", () => {
		assert.equal(resolveSplit("テーマ", ["/h:a", "/h:b", "/h:c", "/h:D2"], saved), 3);
	});

	test("splits by weight when the branches changed beyond recognition", () => {
		// A second H1 turns the file name into the root: two new branches.
		assert.equal(resolveSplit("(file)", ["/h:テーマ", "/h:テーマ2"], saved), undefined);
		assert.equal(resolveSplit("テーマ", ["/h:a", "/h:b"], saved), undefined);
	});

	test("all on the right stays all on the right under the same root only", () => {
		const allRight = encodeSplit("テーマ", keys, 4);
		assert.equal(resolveSplit("テーマ", [...keys, "/h:e"], allRight), 5);
		assert.equal(resolveSplit("(file)", ["/h:テーマ", "/h:テーマ2"], allRight), undefined);
	});
});

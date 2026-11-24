import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { nearestInGap, zoneOfCard } from "./dropTarget.ts";
import type { CardBox } from "./dropTarget.ts";

function card(id: string, top: number, height = 24, left = 0, width = 100): CardBox {
	return { id, left, right: left + width, top, bottom: top + height };
}

describe("zoneOfCard", () => {
	test("keeps the upstream edge bands on an ordinary card", () => {
		const box = card("a", 100, 40); // band = min(40 * 0.3, 14) = 12
		assert.equal(zoneOfCard(box, 105, false), "before");
		assert.equal(zoneOfCard(box, 120, false), "child");
		assert.equal(zoneOfCard(box, 135, false), "after");
	});

	test("splits the root in half: top is first child, bottom is last child", () => {
		const root = card("root", 100, 36);
		assert.equal(zoneOfCard(root, 101, true), "first-child");
		assert.equal(zoneOfCard(root, 117, true), "first-child");
		assert.equal(zoneOfCard(root, 119, true), "child");
		assert.equal(zoneOfCard(root, 135, true), "child");
	});
});

describe("nearestInGap", () => {
	// Two siblings 14px apart, the gap Mindmap Mode leaves by default.
	const upper = card("upper", 100); // 100..124
	const lower = card("lower", 138); // 138..162

	test("a pointer just above a card drops before it", () => {
		assert.deepEqual(nearestInGap([upper, lower], 50, 134, null), {
			id: "lower",
			mode: "before",
		});
	});

	test("a pointer just below a card drops after it", () => {
		assert.deepEqual(nearestInGap([upper, lower], 50, 128, null), {
			id: "upper",
			mode: "after",
		});
	});

	test("ignores the card being dragged", () => {
		assert.deepEqual(nearestInGap([upper, lower], 50, 128, "upper"), {
			id: "lower",
			mode: "before",
		});
	});

	test("ignores cards that do not span the pointer horizontally", () => {
		const aside = card("aside", 130, 24, 300);
		assert.equal(nearestInGap([aside], 50, 128, null), null);
	});

	test("gives up beyond reach so empty canvas never reparents anything", () => {
		// reach = 24 * 0.75 = 18px
		assert.equal(nearestInGap([upper], 50, 143, null), null);
		assert.deepEqual(nearestInGap([upper], 50, 141, null), { id: "upper", mode: "after" });
	});

	test("returns null when there are no cards", () => {
		assert.equal(nearestInGap([], 0, 0, null), null);
	});
});

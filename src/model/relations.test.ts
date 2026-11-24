import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { parseMarkdown } from "./parse.ts";
import { walk } from "./types.ts";
import type { MindNode, ParsedDoc } from "./types.ts";
import { blockIdOf, linksIn, resolveRelations, rewriteLocalLink, withoutBlockId } from "./relations.ts";

function parse(text: string): ParsedDoc {
	return parseMarkdown(text, { title: "Note" });
}

function find(parsed: ParsedDoc, text: string): MindNode {
	let hit: MindNode | null = null;
	walk(parsed.root, (n) => {
		if (!hit && (n.text === text || withoutBlockId(n.text) === text)) hit = n;
	});
	if (!hit) throw new Error(`no node "${text}"`);
	return hit;
}

describe("linksIn", () => {
	test("reads heading links into this note, with and without a label", () => {
		assert.deepEqual(linksIn("see [[#Plan B]] and [[#Risks|because]]", "Note"), [
			{ kind: "heading", heading: "Plan B", label: null, index: 0 },
			{ kind: "heading", heading: "Risks", label: "because", index: 1 },
		]);
	});

	test("reads block links", () => {
		assert.deepEqual(linksIn("[[#^ab12|leads to]]", "Note"), [
			{ kind: "block", id: "ab12", label: "leads to", index: 0 },
		]);
	});

	test("accepts this note's own name in front of the subpath, any case", () => {
		assert.deepEqual(linksIn("[[note#Plan B]]", "Note"), [
			{ kind: "heading", heading: "Plan B", label: null, index: 0 },
		]);
	});

	test("uses the last heading of a nested subpath", () => {
		assert.deepEqual(linksIn("[[#Parent#Child]]", "Note"), [
			{ kind: "heading", heading: "Child", label: null, index: 0 },
		]);
	});

	test("ignores links to other notes, plain note links and embeds", () => {
		assert.deepEqual(linksIn("[[Other#Plan B]] [[Note]] ![[#Plan B]]", "Note"), []);
	});
});

describe("block ids", () => {
	test("finds a trailing block id and strips it for display", () => {
		assert.equal(blockIdOf("Ship it ^x9-a"), "x9-a");
		assert.equal(withoutBlockId("Ship it ^x9-a"), "Ship it");
		assert.equal(blockIdOf("2^10 is big"), null);
		assert.equal(withoutBlockId("no id"), "no id");
	});
});

describe("resolveRelations", () => {
	const NOTE = [
		"# Root",
		"",
		"## Plan A",
		"",
		"- cost [[#Plan B|cheaper than]]",
		"- risk [[#^r1]]",
		"",
		"## Plan B",
		"",
		"- fallback ^r1",
		"- loop [[#Plan B]]",
		"- dangling [[#Nowhere]]",
		"",
	].join("\n");

	test("resolves heading and block links to node ids, keeping labels", () => {
		const p = parse(NOTE);
		const rels = resolveRelations(p, "Note");
		assert.deepEqual(rels, [
			{ fromId: find(p, "cost [[#Plan B|cheaper than]]").id, toId: find(p, "Plan B").id, label: "cheaper than", linkIndex: 0 },
			{ fromId: find(p, "risk [[#^r1]]").id, toId: find(p, "fallback").id, label: null, linkIndex: 0 },
			{ fromId: find(p, "loop [[#Plan B]]").id, toId: find(p, "Plan B").id, label: null, linkIndex: 0 },
		]);
	});

	test("drops links that point at nothing or at the node itself", () => {
		const p = parse("# R\n\n## Self [[#Self]]\n\n- x [[#Missing]]\n");
		assert.deepEqual(resolveRelations(p, "Note"), []);
	});

	test("matches heading text case-insensitively when there is no exact match", () => {
		const p = parse("# R\n\n## Plan B\n\n- a [[#plan b]]\n");
		assert.equal(resolveRelations(p, "Note").length, 1);
	});
});

describe("one relation of several (custom fork)", () => {
	test("each relation knows which of its node's links it is", () => {
		const p = parse("# R\n\n## A\n\n## B\n\n- x [[#A|one]] [[Other#A]] [[#B|two]]\n");
		const rels = resolveRelations(p, "Note");
		assert.deepEqual(rels.map((r) => [r.label, r.linkIndex]), [["one", 0], ["two", 1]]);
	});

	test("rewriteLocalLink replaces only the n-th link into this note", () => {
		const text = "x [[#A|one]] [[Other#A]] [[#B|two]] ^id";
		assert.equal(rewriteLocalLink(text, "Note", 1, () => ""), "x [[#A|one]] [[Other#A]] ^id");
		assert.equal(
			rewriteLocalLink(text, "Note", 0, (l) => `[[${l.note}#${l.subpath}|uno]]`),
			"x [[#A|uno]] [[Other#A]] [[#B|two]] ^id",
		);
		assert.equal(rewriteLocalLink(text, "Note", 5, () => ""), text);
	});
});

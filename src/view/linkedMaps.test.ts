import { test } from "node:test";
import assert from "node:assert/strict";

import { linkTargetsIn, reidentify } from "./linkedMaps.ts";
import { parseMarkdown } from "../model/parse.ts";

test("finds the notes a title links to, not this note's own headings or embeds", () => {
	assert.deepEqual(
		linkTargetsIn("see [[Plan]] and [[Other note#Risks|why]] [[#Local]] ![[Pic.png]] [[Plan]]"),
		["Plan", "Other note"],
	);
	assert.deepEqual(linkTargetsIn("no links"), []);
});

test("reidentify gives every node of a foreign map an id and key of its own", () => {
	const parsed = parseMarkdown("# Other\n\n## A\n\n- a1\n", { title: "Other" });
	const before = [...parsed.byId.keys()];
	reidentify(parsed, "x0", "notes/Other.md");
	const ids = [...parsed.byId.keys()];
	assert.equal(ids.length, before.length);
	assert.ok(ids.every((id) => id.startsWith("x0:")), ids.join(","));
	assert.ok([...parsed.byKey.keys()].every((k) => k.startsWith("ext:notes/Other.md|")));
	assert.equal(parsed.byId.get(parsed.root.id), parsed.root);
	assert.equal(parsed.byKey.get(parsed.root.key), parsed.root);
});

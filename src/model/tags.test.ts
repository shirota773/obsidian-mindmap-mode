import { test } from "node:test";
import assert from "node:assert/strict";

import { isTagLine, partitionTags, tagsIn, withoutTags } from "./tags.ts";
import { parseMarkdown } from "./parse.ts";
import { bodyCardCount } from "./annotations.ts";

test("reads tags the way Obsidian does", () => {
	assert.deepEqual(tagsIn("asdf #hgoe #fuga"), ["hgoe", "fuga"]);
	assert.deepEqual(tagsIn("#a/b #with-dash #x_1 #a/b"), ["a/b", "with-dash", "x_1"]);
	// Not tags: a number, a link's heading, a URL fragment, inline code, mid-word.
	assert.deepEqual(tagsIn("#123 [[#Heading]] http://x.io/#frag `#code` a#b"), []);
});

test("withoutTags leaves the title, spacing tidied", () => {
	assert.equal(withoutTags("asdf #hgoe #fuga"), "asdf");
	assert.equal(withoutTags("#lead then text #tail"), "then text");
	assert.equal(withoutTags("no tags here"), "no tags here");
});

test("a tag line holds tags and nothing else", () => {
	assert.equal(isTagLine("#tag #hoge "), true);
	assert.equal(isTagLine("#tag and words"), false);
	assert.equal(isTagLine("   "), false);
});

test("a body block of only tag lines becomes the owner's tags, not a content card", () => {
	const parsed = parseMarkdown("# Root\n#tag #hoge\n\n## A\nreal text\n", { title: "N" });
	partitionTags(parsed.root, parsed.doc.lines);
	assert.equal(parsed.root.tagIndices.length, 1);
	assert.equal(bodyCardCount(parsed.root), 0);
	const a = parsed.root.children[0];
	assert.equal(a.tagIndices.length, 0);
	assert.equal(bodyCardCount(a), 1);
});

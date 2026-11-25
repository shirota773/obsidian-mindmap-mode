/**
 * Custom fork: tags on the map.
 *
 * A `#tag` in a node's title, and a line under a heading that holds nothing but
 * tags (`#tag #hoge`), both belong to that node. The map draws them as chips on
 * its card instead of as title text or a content card of their own. The note is
 * not changed: they stay ordinary Obsidian tags.
 *
 * Pure: no Obsidian, no DOM.
 */
import { walk } from "./types.ts";
import type { MindNode } from "./types.ts";

/**
 * `#tag` at the start or after whitespace; the characters Obsidian stops a tag
 * at end it. A tag of digits alone is not one.
 */
const TAG = /(^|\s)#([^\s#!"$%&'()*+,.:;<=>?@[\]^`{|}~\\]+)/g;

function isTag(name: string): boolean {
	return !/^\d+$/.test(name);
}

/** The tags in `text`, without the `#`, each once, first mention first. */
export function tagsIn(text: string): string[] {
	const out: string[] = [];
	for (const m of text.matchAll(TAG)) {
		const name = m[2];
		if (isTag(name) && !out.includes(name)) out.push(name);
	}
	return out;
}

/** `text` with its tags taken out, spacing tidied. */
export function withoutTags(text: string): string {
	return text
		.replace(TAG, (whole, lead: string, name: string) => (isTag(name) ? lead : whole))
		.replace(/[ \t]{2,}/g, " ")
		.trim();
}

/** A line that holds tags and nothing else. */
export function isTagLine(line: string): boolean {
	return line.trim() !== "" && tagsIn(line).length > 0 && withoutTags(line) === "";
}

/** Mark the body blocks that are only tag lines, for every node under `root`. */
export function partitionTags(root: MindNode, lines: readonly string[]): void {
	walk(root, (node) => {
		node.tagIndices = node.bodyRanges.flatMap(([start, end], index) => {
			if (node.annotationIndices.includes(index)) return [];
			const block = lines.slice(start, end + 1).filter((line) => line.trim() !== "");
			return block.length > 0 && block.every(isTagLine) ? [index] : [];
		});
	});
}

/** A node's tags: those in its title, then those on its tag lines. */
export function nodeTags(node: MindNode, lines: readonly string[]): string[] {
	const out = tagsIn(node.text);
	for (const index of node.tagIndices) {
		const [start, end] = node.bodyRanges[index];
		for (const tag of tagsIn(lines.slice(start, end + 1).join("\n"))) {
			if (!out.includes(tag)) out.push(tag);
		}
	}
	return out;
}

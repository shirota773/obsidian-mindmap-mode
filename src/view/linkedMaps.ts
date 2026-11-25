/**
 * Custom fork: maps of other notes shown on this note's canvas.
 *
 * Read-only: the other note is parsed as-is and drawn as one more map that can
 * be moved, folded and opened, never edited from here. Its nodes get ids and
 * keys of their own so they can never be mistaken for this note's nodes --
 * every editing path looks a node up in this note's parse and finds nothing.
 *
 * Pure, so it is tested without Obsidian or a DOM.
 */
import { walk } from "../model/types.ts";
import type { ParsedDoc } from "../model/types.ts";

/** `[[target...]]`, not an embed, not a link into this note. */
const LINK = /(!?)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

/** The link paths of the other notes `text` links to, first mention first. */
export function linkTargetsIn(text: string): string[] {
	const out: string[] = [];
	for (const m of text.matchAll(LINK)) {
		const [, bang, target] = m;
		const path = target.trim();
		if (bang || path === "" || out.includes(path)) continue;
		out.push(path);
	}
	return out;
}

/** Prefix every id with `prefix` and every key with the note's path, in place. */
export function reidentify(parsed: ParsedDoc, prefix: string, path: string): void {
	parsed.byId.clear();
	parsed.byKey.clear();
	walk(parsed.root, (node) => {
		node.id = `${prefix}:${node.id}`;
		node.key = `ext:${path}|${node.key}`;
		parsed.byId.set(node.id, node);
		parsed.byKey.set(node.key, node);
	});
}

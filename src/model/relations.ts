/**
 * Custom fork: relation lines between nodes of the same note.
 *
 * A relation is an ordinary Obsidian link into the note itself, written in the
 * source node's title: `[[#Heading]]` for a heading, `[[#^id]]` for a list item
 * carrying a block id. An alias (`[[#Heading|causes]]`) is the relation's label.
 * Nothing new is added to the markdown: the links work in Obsidian's editor,
 * reading view and backlinks exactly as before; the map only draws them.
 *
 * Pure: no Obsidian, no DOM.
 */
import { walk } from "./types.ts";
import type { MindNode, ParsedDoc } from "./types.ts";

export type InternalLink =
	| { kind: "heading"; heading: string; label: string | null }
	| { kind: "block"; id: string; label: string | null };

export interface Relation {
	fromId: string;
	toId: string;
	label: string | null;
	/** Which of the source's links into this note it is, counting from 0. */
	linkIndex: number;
}

/** The pieces of one `[[note#subpath|label]]`, as written. */
export interface LocalLinkParts {
	note: string;
	subpath: string;
	label: string | null;
}

/** `[[note#subpath|label]]`, not preceded by `!` (an embed). */
const LINK = /(!?)\[\[([^\]|#]*)#([^\]|]+)(?:\|([^\]]*))?\]\]/g;
const BLOCK_ID = /[ \t]\^([A-Za-z0-9-]+)$/;

function isLocal(note: string, noteName: string): boolean {
	return note.trim() === "" || note.trim().toLowerCase() === noteName.toLowerCase();
}

/**
 * Links in `text` that point into the note called `noteName`. `index` counts
 * every such link in order, so it is the same number `rewriteLocalLink` takes.
 */
export function linksIn(text: string, noteName: string): Array<InternalLink & { index: number }> {
	const out: Array<InternalLink & { index: number }> = [];
	let index = -1;
	for (const m of text.matchAll(LINK)) {
		const [, bang, note, subpath, rawLabel] = m;
		if (bang || !isLocal(note, noteName)) continue;
		index++;
		const label = rawLabel === undefined || rawLabel.trim() === "" ? null : rawLabel.trim();
		if (subpath.startsWith("^")) {
			out.push({ kind: "block", id: subpath.slice(1), label, index });
			continue;
		}
		const heading = subpath.split("#").filter((s) => s.trim() !== "").at(-1)?.trim();
		if (heading) out.push({ kind: "heading", heading, label, index });
	}
	return out;
}

/**
 * `text` with its `index`-th link into this note replaced by what `replace`
 * returns ("" removes it), spacing tidied. Unchanged when there is no such link.
 */
export function rewriteLocalLink(
	text: string,
	noteName: string,
	index: number,
	replace: (link: LocalLinkParts) => string,
): string {
	let seen = -1;
	let hit = false;
	const out = text.replace(LINK, (whole, bang: string, note: string, subpath: string, rawLabel?: string) => {
		if (bang || !isLocal(note, noteName)) return whole;
		seen++;
		if (seen !== index) return whole;
		hit = true;
		return replace({ note, subpath, label: rawLabel ?? null });
	});
	return hit ? out.replace(/[ \t]{2,}/g, " ").trim() : text;
}

/** The block id a line ends with (` ^abc`), or null. */
export function blockIdOf(text: string): string | null {
	return BLOCK_ID.exec(text)?.[1] ?? null;
}

/** `text` without its trailing block id, for display. */
export function withoutBlockId(text: string): string {
	return text.replace(BLOCK_ID, "");
}

/** Whether `[[#text]]` would reach this heading: Obsidian cannot link these characters. */
export function isLinkableHeading(text: string): boolean {
	return text.trim() !== "" && !/[#|^[\]]/.test(text);
}

/** Every relation in the note whose two ends are both nodes of the map. */
export function resolveRelations(parsed: ParsedDoc, noteName: string): Relation[] {
	const headings: MindNode[] = [];
	const blocks = new Map<string, MindNode>();
	const all: MindNode[] = [];
	walk(parsed.root, (n) => {
		if (n.kind === "body") return;
		all.push(n);
		if ((n.kind === "heading" || n.kind === "root") && !n.virtual) headings.push(n);
		const id = blockIdOf(n.text);
		if (id !== null && !blocks.has(id)) blocks.set(id, n);
	});

	const findHeading = (name: string): MindNode | undefined =>
		headings.find((h) => withoutBlockId(h.text).trim() === name) ??
		headings.find((h) => withoutBlockId(h.text).trim().toLowerCase() === name.toLowerCase());

	const out: Relation[] = [];
	const seen = new Set<string>();
	for (const node of all) {
		for (const link of linksIn(node.text, noteName)) {
			const target = link.kind === "block" ? blocks.get(link.id) : findHeading(link.heading);
			if (!target || target === node) continue;
			const key = `${node.id}>${target.id}>${link.label ?? ""}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({ fromId: node.id, toId: target.id, label: link.label, linkIndex: link.index });
		}
	}
	return out;
}

/** `text` with every link into this note removed, spacing tidied. */
export function stripInternalLinks(text: string, noteName: string): string {
	return text
		.replace(LINK, (whole, bang: string, note: string) =>
			bang || !isLocal(note, noteName) ? whole : "",
		)
		.replace(/[ \t]{2,}/g, " ")
		.trim();
}

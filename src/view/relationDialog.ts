/**
 * Custom fork: the two small dialogs behind "Add relation…" -- pick the node the
 * relation points at, then (optionally) name the relation.
 */
import { App, FuzzySuggestModal, Modal, Setting, TFile } from "obsidian";
import type { MindNode } from "../model/types.ts";
import { stripInternalLinks, withoutBlockId } from "../model/relations.ts";

/** A node as the picker lists it: its path from the top, readable. */
export function breadcrumb(node: MindNode, noteName: string): string {
	const parts: string[] = [];
	for (let n: MindNode | null = node; n; n = n.parent) {
		if (n.virtual) continue;
		parts.unshift(stripInternalLinks(withoutBlockId(n.text), noteName) || "(empty)");
	}
	return parts.join(" › ");
}

export class RelationTargetModal extends FuzzySuggestModal<MindNode> {
	private readonly candidates: MindNode[];
	private readonly noteName: string;
	private readonly onPick: (node: MindNode) => void;

	constructor(app: App, candidates: MindNode[], noteName: string, onPick: (node: MindNode) => void) {
		super(app);
		this.candidates = candidates;
		this.noteName = noteName;
		this.onPick = onPick;
		this.setPlaceholder("Relation to which node?");
	}

	getItems(): MindNode[] {
		return this.candidates;
	}

	getItemText(node: MindNode): string {
		return breadcrumb(node, this.noteName);
	}

	onChooseItem(node: MindNode): void {
		this.onPick(node);
	}
}

/** Custom fork: pick a note whose map to show on this canvas. */
export class NotePickerModal extends FuzzySuggestModal<TFile> {
	private readonly files: TFile[];
	private readonly onPick: (file: TFile) => void;

	constructor(app: App, files: TFile[], onPick: (file: TFile) => void) {
		super(app);
		this.files = files;
		this.onPick = onPick;
		this.setPlaceholder("Show the map of which note?");
	}

	getItems(): TFile[] {
		return this.files;
	}

	getItemText(file: TFile): string {
		return file.path.replace(/\.md$/, "");
	}

	onChooseItem(file: TFile): void {
		this.onPick(file);
	}
}

export class RelationLabelModal extends Modal {
	private value: string;
	private readonly targetName: string;
	private readonly onDone: (label: string | null) => void;
	private readonly buttonText: string;

	constructor(
		app: App,
		targetName: string,
		onDone: (label: string | null) => void,
		initial: string | null = null,
		buttonText = "Add",
	) {
		super(app);
		this.targetName = targetName;
		this.onDone = onDone;
		this.value = initial ?? "";
		this.buttonText = buttonText;
	}

	override onOpen(): void {
		this.setTitle(`Relation to "${this.targetName}"`);
		const submit = (): void => {
			this.close();
			this.onDone(this.value.trim() === "" ? null : this.value.trim());
		};
		new Setting(this.contentEl)
			.setName("Label")
			.setDesc("Shown on the arrow. Leave empty for none.")
			.addText((text) => {
				text.setPlaceholder("e.g. causes").setValue(this.value).onChange((v) => (this.value = v));
				text.inputEl.addEventListener("keydown", (ev) => {
					if (ev.key === "Enter" && !ev.isComposing) {
						ev.preventDefault();
						submit();
					}
				});
				window.setTimeout(() => text.inputEl.focus(), 0);
			});
		new Setting(this.contentEl).addButton((b) => b.setButtonText(this.buttonText).setCta().onClick(submit));
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}

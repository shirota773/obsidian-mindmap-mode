import type { Canvas } from "./canvas.ts";
import { ClickGate, opensEditor } from "./clickIntent.ts";
import { comboFromEvent, resolveAction } from "./shortcuts.ts";
import type { ShortcutBindings } from "./shortcuts.ts";
import { nearestInGap, zoneOfCard } from "./dropTarget.ts";
import type { CardBox, DropMode } from "./dropTarget.ts";
import { sideSlot } from "./sides.ts";
import type { SideCard, SideSign } from "./sides.ts";

export type Direction = "up" | "down" | "left" | "right";

/**
 * Where a dragged node lands relative to the card it was dropped on: inside it
 * as a child, beside it as a sibling above or below, or (on the root) first
 * among its children.
 */
export type { DropMode };

/** Everything the interaction layer needs from the view. */
export interface MapController {
	canvas: Canvas;
	isEditing(): boolean;
	selectedId(): string | null;
	select(id: string | null): void;
	beginEdit(id: string): void;
	editAnnotation(id: string): void;

	addChildTo(id: string): void;
	addSiblingTo(id: string): void;
	removeNode(id: string): void;
	indent(id: string): void;
	outdent(id: string): void;
	/** Swap the node with the sibling above / below it. */
	moveUp(id: string): void;
	moveDown(id: string): void;
	toggleFold(id: string): void;
	toggleCheck(id: string): void;
	/** Open a note-content block whole, rendered, in its own dialog. */
	expandBody(id: string): void;
	/** Follow a link written in a card. */
	openLink(href: string, ev: MouseEvent): void;
	/** The node's own menu, at the pointer. */
	showMenu(id: string, ev: MouseEvent): void;
	/** Custom fork: the menu for one relation line, by its index in the drawn list. */
	showRelationMenu(index: number, ev: MouseEvent): void;
	/** Custom fork: "Add relation…" is waiting for its target to be clicked. */
	isPickingRelation(): boolean;
	pickRelationTarget(id: string): void;
	navigate(direction: Direction): void;

	openSearch(): void;
	/** False when there was no search bar to close, so Escape stays free. */
	closeSearch(): boolean;

	canDrop(id: string, targetId: string, mode: DropMode): boolean;
	move(id: string, targetId: string, mode: DropMode): void;
	/** Custom fork: free left/right placement in balanced layout. */
	isBalanced(): boolean;
	canDropOnSide(id: string, rootId: string): boolean;
	moveToSide(id: string, side: SideSign, index: number, rootId: string): void;
	/** Custom fork: with several maps on the canvas, a map's root drags its whole map. */
	canDragMap(id: string): boolean;
	dragMap(id: string, dx: number, dy: number): void;
	endMapDrag(): void;
	/** Custom fork: the menu for empty canvas. */
	showCanvasMenu(ev: MouseEvent): void;

	undo(): void;
	redo(): void;
	fit(): void;
	centreOnSelection(): void;

	/** The keys the map answers to: the defaults with the user's changes on top. */
	bindings(): ShortcutBindings;
}

const DRAG_THRESHOLD = 5;

/** The four navigation actions, as the direction each one steps in. */
const DIRECTIONS: Record<
	"navigate-up" | "navigate-down" | "navigate-left" | "navigate-right",
	Direction
> = {
	"navigate-up": "up",
	"navigate-down": "down",
	"navigate-left": "left",
	"navigate-right": "right",
};

/** Reached only by an action no `case` claimed, which is a compile error. */
function assertHandled(_action: never): void {}

function nodeIdFrom(target: EventTarget | null): string | null {
	if (!(target instanceof HTMLElement)) return null;
	const el = target.closest<HTMLElement>(".mm-node");
	return el?.dataset.id ?? null;
}

const LINK_SELECTOR = ".mm-link[data-href], .mm-embed[data-href]";

/** The link target under the pointer, or null where there is no link. */
function hrefFrom(target: HTMLElement): string | null {
	return target.closest<HTMLElement>(LINK_SELECTOR)?.dataset.href ?? null;
}

/** The kind of card the pointer is over, or null off every card. */
function kindFrom(target: HTMLElement): string | null {
	return target.closest<HTMLElement>(".mm-node")?.dataset.kind ?? null;
}

/** Custom fork: the relation a pointer target belongs to, or null. */
function relationIndexFrom(target: Element | null): number | null {
	const raw = target?.closest?.("[data-relation]")?.getAttribute("data-relation");
	if (raw == null) return null;
	const index = Number(raw);
	return Number.isInteger(index) && index >= 0 ? index : null;
}

export function attachInteractions(controller: MapController): () => void {
	const { canvas } = controller;
	const viewport = canvas.viewport;
	const cleanups: Array<() => void> = [];

	const on = <K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		handler: (ev: HTMLElementEventMap[K]) => void,
		options?: AddEventListenerOptions,
	): void => {
		el.addEventListener(type, handler as EventListener, options);
		cleanups.push(() => el.removeEventListener(type, handler as EventListener));
	};

	// Whether a click is this drag's tail or a click of its own. The rule, and
	// why the flag also comes down on pointerdown, is in `clickIntent.ts`.
	const gate = new ClickGate();

	// --- clicking ------------------------------------------------------------
	on(viewport, "click", (ev) => {
		const target = ev.target as HTMLElement;

		// Custom fork: while picking a relation target, a card click is the pick.
		// Blank canvas does nothing, so a pan never cancels the pick by accident.
		if (controller.isPickingRelation()) {
			ev.stopPropagation();
			const id = nodeIdFrom(target);
			if (id) controller.pickRelationTarget(id);
			return;
		}

		// Custom fork: a relation line is clicked like a card is right-clicked.
		const relation = relationIndexFrom(target);
		if (relation !== null) {
			ev.stopPropagation();
			controller.showRelationMenu(relation, ev);
			return;
		}

		// A link opens from any card. Dragging a node by one still works: only a
		// press that never became a drag arrives here as a click.
		const intent = gate.click({
			kind: kindFrom(target),
			href: hrefFrom(target),
			clickCount: ev.detail,
		});
		if (intent.action === "swallow") {
			ev.stopPropagation();
			return;
		}
		if (intent.action === "open") {
			controller.openLink(intent.href, ev);
			ev.preventDefault();
			ev.stopPropagation();
			return;
		}

		// Ahead of the fallback below: the expand button sits inside the card,
		// so letting the click through would also drop the selection.
		const expand = target.closest<HTMLElement>(".mm-expand");
		if (expand) {
			const id = nodeIdFrom(expand);
			if (id) controller.expandBody(id);
			ev.stopPropagation();
			return;
		}
		const add = target.closest<HTMLElement>(".mm-add");
		if (add) {
			const id = nodeIdFrom(add);
			if (id) controller.addChildTo(id);
			ev.stopPropagation();
			return;
		}
		const toggle = target.closest<HTMLElement>(".mm-toggle");
		if (toggle) {
			const id = nodeIdFrom(toggle);
			if (id) controller.toggleFold(id);
			ev.stopPropagation();
			return;
		}
		// Custom fork: the tooltip-mode annotation icon opens the editor -- the
		// only way to read the annotation where there is no hover (mobile).
		const badge = target.closest<HTMLElement>(".mm-annotation-badge");
		if (badge) {
			const id = nodeIdFrom(badge);
			if (id) controller.editAnnotation(id);
			ev.stopPropagation();
			return;
		}
		const checkbox = target.closest<HTMLElement>(".mm-checkbox");
		if (checkbox) {
			const id = nodeIdFrom(checkbox);
			if (id) controller.toggleCheck(id);
			ev.stopPropagation();
			return;
		}
		const id = nodeIdFrom(target);
		controller.select(id);
		if (!controller.isEditing()) viewport.focus({ preventScroll: true });
	});

	on(viewport, "dblclick", (ev) => {
		const target = ev.target as HTMLElement;
		const onExpand = target.closest(".mm-expand") !== null;
		if (!opensEditor({ href: hrefFrom(target), onExpand })) return;
		const id = nodeIdFrom(target);
		if (!id) return;
		ev.preventDefault();
		if (target.closest(".mm-annotation")) {
			controller.editAnnotation(id);
			return;
		}
		controller.beginEdit(id);
	});

	// --- dragging to reparent or reorder ---------------------------------------
	// Custom fork: a map being dragged by its root.
	let mapDrag: { id: string; pointer: number; origin: { x: number; y: number }; moving: boolean } | null = null;
	let mapFrame = 0;
	let mapAt = { x: 0, y: 0 };
	let dragId: string | null = null;
	let dragPointer = -1;
	let origin = { x: 0, y: 0 };
	let dragging = false;
	let hovered: HTMLElement | null = null;
	let hoveredMode: DropMode = "child";

	const DROP_CLASSES = [
		"is-drop-target",
		"is-drop-before",
		"is-drop-after",
		"is-drop-invalid",
	];

	const clearHover = (): void => {
		hovered?.removeClasses(DROP_CLASSES);
		hovered = null;
	};

	/**
	 * A node's card as a screen-space box.
	 *
	 * A rect is the right tool here -- this is hit-testing in screen space, where
	 * the pointer already lives, not measuring a card for layout.
	 *
	 * The card's rect, not the node's: the highlight these zones choose is drawn
	 * on `.mm-card`, and an annotation strip stretches `.mm-node` below it. Read
	 * off the node, the "after" band would sit at the bottom of the strip while
	 * the line marking it was drawn along the bottom of the card.
	 */
	const boxOf = (node: HTMLElement, id: string): CardBox => {
		const el = node.querySelector<HTMLElement>(".mm-card") ?? node;
		const rect = el.getBoundingClientRect();
		return { id, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
	};

	/**
	 * The zone under the pointer, falling back to "child" where reordering is
	 * refused, so a card never grows a silent dead band along its edges.
	 */
	const dropModeFor = (
		id: string,
		targetId: string,
		el: HTMLElement,
		clientY: number,
	): DropMode => {
		const zone = zoneOfCard(boxOf(el, targetId), clientY, el.dataset.kind === "root");
		if (zone !== "child" && !controller.canDrop(id, targetId, zone)) return "child";
		return zone;
	};

	interface DropHit {
		el: HTMLElement;
		id: string;
		mode: DropMode;
		/** Custom fork: a drop in open canvas beside a map's root, on that side. */
		slot?: { side: SideSign; index: number; rootId: string };
	}

	/**
	 * Custom fork: in balanced layout, open canvas in the first-level column on
	 * either side of the root is a place on that side. The highlight goes on the
	 * card the node will sit above (or below the last one, or on the root when
	 * the side is empty) so the drop says where it lands.
	 */
	const sideHit = (dragged: string, x: number, y: number): DropHit | null => {
		if (!controller.isBalanced()) return null;
		// Custom fork: every map's root has its own two sides; the nearest root
		// whose first-level column holds the pointer wins.
		let best: { hit: DropHit; distance: number } | null = null;
		viewport
			.querySelectorAll<HTMLElement>('.mm-node[data-kind="root"]:not(.is-ghost-root)')
			.forEach((rootEl) => {
				const rootId = rootEl.dataset.id;
				if (!rootId || !controller.canDropOnSide(dragged, rootId)) return;
				const cards: Array<SideCard & { el: HTMLElement }> = [];
				viewport
					.querySelectorAll<HTMLElement>(`.mm-node[data-depth="1"][data-map="${CSS.escape(rootId)}"]`)
					.forEach((el) => {
						const id = el.dataset.id;
						if (!id || id === dragged) return;
						cards.push({ ...boxOf(el, id), side: el.dataset.side === "left" ? -1 : 1, el });
					});
				const rootBox = boxOf(rootEl, rootId);
				const found = sideSlot(rootBox, cards, x, y);
				if (!found) return;
				const slot = { ...found, rootId };
				const distance = Math.hypot(x - (rootBox.left + rootBox.right) / 2, y - (rootBox.top + rootBox.bottom) / 2);
				if (best && best.distance <= distance) return;

				const own = cards.filter((c) => c.side === slot.side).sort((a, b) => a.top - b.top);
				const below = own[slot.index];
				const above = own[own.length - 1];
				const hit: DropHit = below
					? { el: below.el, id: below.id, mode: "before", slot }
					: above
						? { el: above.el, id: above.id, mode: "after", slot }
						: { el: rootEl, id: rootId, mode: "child", slot };
				best = { hit, distance };
			});
		return (best as { hit: DropHit } | null)?.hit ?? null;
	};

	/**
	 * Custom fork: what a drop at this point would do.
	 *
	 * On a card it is that card's zone. In the gap between cards -- where
	 * upstream found nothing at all -- it is "before" / "after" the nearest card
	 * spanning the pointer, which turns the whole gap between two siblings into a
	 * reorder target instead of the few pixels at each card's edge.
	 */
	const hitTest = (dragged: string, x: number, y: number): DropHit | null => {
		const under = document.elementFromPoint(x, y);
		const onCard = under instanceof HTMLElement ? under.closest<HTMLElement>(".mm-node") : null;
		const onCardId = onCard?.dataset.id;
		if (onCard && onCardId) {
			if (onCardId === dragged) return null;
			return { el: onCard, id: onCardId, mode: dropModeFor(dragged, onCardId, onCard, y) };
		}

		const nodes = new Map<string, HTMLElement>();
		const boxes: CardBox[] = [];
		viewport
			.querySelectorAll<HTMLElement>('.mm-node:not([data-kind="body"]):not([data-kind="root"])')
			.forEach((el) => {
				const id = el.dataset.id;
				if (!id) return;
				nodes.set(id, el);
				boxes.push(boxOf(el, id));
			});
		const gap = nearestInGap(boxes, x, y, dragged);
		const el = gap ? nodes.get(gap.id) : undefined;
		if (!gap || !el || !controller.canDrop(dragged, gap.id, gap.mode)) {
			return sideHit(dragged, x, y);
		}
		return { el, id: gap.id, mode: gap.mode };
	};

	// Where the pointer was when this frame was asked for, and the handle that
	// asked. A pointermove arrives far more often than the screen is painted,
	// and resolving the drop zone means `elementFromPoint` plus a rect off
	// whatever it finds -- two forced layouts for a highlight that can only be
	// seen once a frame.
	let dropFrame = 0;
	let dropAt = { x: 0, y: 0 };

	const cancelDropFrame = (): void => {
		if (dropFrame === 0) return;
		window.cancelAnimationFrame(dropFrame);
		dropFrame = 0;
	};

	/** Resolve what is under the last pointer position and highlight it. */
	const resolveDrop = (): void => {
		if (dragId === null || !dragging) return;
		// Pointer capture makes ev.target useless, so hit-test by coordinates.
		const hit = hitTest(dragId, dropAt.x, dropAt.y);
		const targetEl = hit?.el ?? null;
		const mode = hit?.mode ?? "child";
		// The zone can change without the card changing, and the highlight has to
		// follow the pointer across that boundary.
		if (targetEl === hovered && mode === hoveredMode) return;
		clearHover();
		if (!hit) return;

		hovered = hit.el;
		hoveredMode = mode;
		if (hit.slot) hit.el.addClass(mode === "child" ? "is-drop-target" : mode === "after" ? "is-drop-after" : "is-drop-before");
		else if (!controller.canDrop(dragId, hit.id, mode)) hit.el.addClass("is-drop-invalid");
		else if (mode === "child") hit.el.addClass("is-drop-target");
		// "first-child" draws the line above the root: the node goes in at the top.
		else hit.el.addClass(mode === "after" ? "is-drop-after" : "is-drop-before");
	};

	const endDrag = (): void => {
		cancelDropFrame();
		if (dragId) {
			viewport
				.querySelector<HTMLElement>(`.mm-node[data-id="${CSS.escape(dragId)}"]`)
				?.removeClass("is-dragging");
		}
		viewport.removeClass("is-dragging-node");
		clearHover();
		dragId = null;
		dragPointer = -1;
		dragging = false;
	};

	on(viewport, "pointerdown", (ev) => {
		// Before every early return below: a new press is a new gesture, and
		// whatever the last drag left owing is owed no longer.
		gate.pointerDown();
		if (ev.button !== 0 || controller.isEditing()) return;
		// Custom fork: no node drag while a click is picking a relation target.
		if (controller.isPickingRelation()) return;
		const target = ev.target as HTMLElement;
		if (target.closest(".mm-tools, .mm-checkbox, .mm-annotation-badge")) return;
		const card = target.closest<HTMLElement>(".mm-card");
		// A body card stands for lines the note owns, not a node that can be
		// reparented, so it never starts a drag.
		if (!card || card.closest('.mm-node[data-kind="body"]')) return;
		const id = nodeIdFrom(card);
		if (!id) return;

		if (controller.canDragMap(id)) {
			mapDrag = { id, pointer: ev.pointerId, origin: { x: ev.clientX, y: ev.clientY }, moving: false };
			return;
		}

		dragId = id;
		dragPointer = ev.pointerId;
		origin = { x: ev.clientX, y: ev.clientY };
		dragging = false;
	});

	on(viewport, "pointermove", (ev) => {
		if (mapDrag && ev.pointerId === mapDrag.pointer) {
			const drag = mapDrag;
			if (!drag.moving) {
				if (Math.hypot(ev.clientX - drag.origin.x, ev.clientY - drag.origin.y) < DRAG_THRESHOLD) return;
				drag.moving = true;
				viewport.addClass("is-dragging-map");
				viewport.setPointerCapture(ev.pointerId);
			}
			mapAt = { x: ev.clientX - drag.origin.x, y: ev.clientY - drag.origin.y };
			if (mapFrame !== 0) return;
			mapFrame = window.requestAnimationFrame(() => {
				mapFrame = 0;
				if (mapDrag) controller.dragMap(mapDrag.id, mapAt.x, mapAt.y);
			});
			return;
		}
		if (dragId === null || ev.pointerId !== dragPointer) return;

		if (!dragging) {
			const moved = Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y);
			if (moved < DRAG_THRESHOLD) return;
			dragging = true;
			viewport.addClass("is-dragging-node");
			viewport
				.querySelector<HTMLElement>(`.mm-node[data-id="${CSS.escape(dragId)}"]`)
				?.addClass("is-dragging");
			viewport.setPointerCapture(ev.pointerId);
		}

		dropAt = { x: ev.clientX, y: ev.clientY };
		if (dropFrame !== 0) return;
		dropFrame = window.requestAnimationFrame(() => {
			dropFrame = 0;
			resolveDrop();
		});
	});

	const endMapDrag = (ev: PointerEvent | null): void => {
		const drag = mapDrag;
		if (!drag) return;
		mapDrag = null;
		if (mapFrame !== 0) {
			window.cancelAnimationFrame(mapFrame);
			mapFrame = 0;
		}
		viewport.removeClass("is-dragging-map");
		if (!drag.moving) return;
		gate.dragEnded();
		if (ev) controller.dragMap(drag.id, ev.clientX - drag.origin.x, ev.clientY - drag.origin.y);
		controller.endMapDrag();
	};

	const finishDrag = (ev: PointerEvent): void => {
		if (mapDrag && ev.pointerId === mapDrag.pointer) {
			endMapDrag(ev);
			return;
		}
		if (dragId === null || ev.pointerId !== dragPointer) return;
		if (dragging) {
			gate.dragEnded();
			const hit = hitTest(dragId, ev.clientX, ev.clientY);
			if (hit?.slot) {
				const source = dragId;
				endDrag();
				controller.moveToSide(source, hit.slot.side, hit.slot.index, hit.slot.rootId);
				return;
			}
			if (hit && controller.canDrop(dragId, hit.id, hit.mode)) {
				const source = dragId;
				endDrag();
				controller.move(source, hit.id, hit.mode);
				return;
			}
		}
		endDrag();
	};
	on(viewport, "pointerup", finishDrag);
	on(viewport, "pointercancel", () => {
		endMapDrag(null);
		endDrag();
	});

	// --- the node menu ---------------------------------------------------------
	on(viewport, "contextmenu", (ev) => {
		// A node being edited is a text field, and it keeps the platform's own
		// menu -- cut, copy, paste, spelling.
		if (controller.isEditing()) return;
		const relation = relationIndexFrom(ev.target as Element | null);
		if (relation !== null) {
			ev.preventDefault();
			endDrag();
			controller.showRelationMenu(relation, ev);
			return;
		}
		const id = nodeIdFrom(ev.target);
		// Custom fork: empty canvas gets the map's own menu as well.
		if (!id) {
			ev.preventDefault();
			endDrag();
			controller.showCanvasMenu(ev);
			return;
		}
		ev.preventDefault();
		endDrag();
		controller.showMenu(id, ev);
	});

	// --- keyboard -------------------------------------------------------------
	on(viewport, "keydown", (ev) => {
		if (controller.isEditing()) return;

		// Every key the map answers goes through the one table, so what the
		// settings tab shows and what happens here cannot drift. A press with a
		// modifier the binding does not name is not that binding: Alt+Enter is
		// not Enter.
		const action = resolveAction(controller.bindings(), comboFromEvent(ev));
		if (!action) return;
		const id = controller.selectedId();

		switch (action) {
			case "undo":
				ev.preventDefault();
				controller.undo();
				return;
			case "redo":
				ev.preventDefault();
				controller.redo();
				return;
			case "fit":
				ev.preventDefault();
				controller.fit();
				return;
			case "zoom-in":
				ev.preventDefault();
				canvas.zoomBy(1.2);
				return;
			case "zoom-out":
				ev.preventDefault();
				canvas.zoomBy(1 / 1.2);
				return;
			case "centre-selection":
				ev.preventDefault();
				controller.centreOnSelection();
				return;
			// The map's own Ctrl/Cmd+F. The view's keymap scope is what normally
			// claims it -- this handler needs the viewport to hold the DOM focus,
			// which it only does once a card has been clicked -- so this is the
			// belt to that pair of braces. `openSearch` is idempotent, so the two
			// paths overlapping costs nothing.
			case "search":
				ev.preventDefault();
				controller.openSearch();
				return;
			case "close-search":
				// Only ours while a search is open; otherwise Escape keeps
				// whatever meaning Obsidian gives it. The view's scope registers
				// the same key on the same terms; whichever sees it first, the
				// second call finds no bar left to close.
				if (!controller.closeSearch()) return;
				ev.preventDefault();
				return;
			case "navigate-up":
			case "navigate-down":
			case "navigate-left":
			case "navigate-right":
				// No selection is not a reason to stand still: `navigate` takes
				// the root when there is nothing selected yet.
				ev.preventDefault();
				controller.navigate(DIRECTIONS[action]);
				return;
			// Deliberately handled here and not in the view's keymap scope: a
			// move is not idempotent the way `openSearch` is, and a key both
			// paths saw would move the node two places instead of one. The same
			// reasoning is why this one stops the event rather than only
			// preventing the default -- Obsidian's keymap sits on the document,
			// so a hotkey a user has bound to the same combination would
			// otherwise fire on top of this.
			case "move-up":
				if (!id) return;
				ev.preventDefault();
				ev.stopPropagation();
				controller.moveUp(id);
				return;
			case "move-down":
				if (!id) return;
				ev.preventDefault();
				ev.stopPropagation();
				controller.moveDown(id);
				return;
			case "add-child":
				if (!id) return;
				ev.preventDefault();
				controller.addChildTo(id);
				return;
			case "add-sibling":
				if (!id) return;
				ev.preventDefault();
				controller.addSiblingTo(id);
				return;
			case "edit-title":
				if (!id) return;
				ev.preventDefault();
				controller.beginEdit(id);
				return;
			case "delete-node":
				if (!id) return;
				ev.preventDefault();
				controller.removeNode(id);
				return;
			case "toggle-check":
				if (!id) return;
				ev.preventDefault();
				controller.toggleCheck(id);
				return;
			case "toggle-fold":
				if (!id) return;
				ev.preventDefault();
				controller.toggleFold(id);
				return;
			case "indent":
				if (!id) return;
				ev.preventDefault();
				controller.indent(id);
				return;
			case "outdent":
				if (!id) return;
				ev.preventDefault();
				controller.outdent(id);
				return;
			case "expand-body":
				if (!id) return;
				ev.preventDefault();
				controller.expandBody(id);
				return;
			default:
				// An action with no case here is a compile error, which is the
				// point: the table cannot grow a row nothing performs.
				assertHandled(action);
				return;
		}
	});

	return () => {
		cancelDropFrame();
		for (const off of cleanups) off();
		cleanups.length = 0;
	};
}

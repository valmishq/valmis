/// <reference lib="dom" />
//
// Functions in this file are SERIALIZED by Playwright and executed INSIDE the
// page (browser context), not in the backend process — hence the `dom` lib
// reference and the self-contained, closure-free bodies. They live in their own
// file so the DOM globals stay scoped here and never leak into the Node-typed
// BrowserService.

/** One interactive element discovered by {@link collectInteractiveElements}. */
export interface SnapshotElement {
	ref: string;
	role: string;
	name: string;
	type: string;
}

/**
 * Tag every visible, enabled interactive element with a stable `data-ai-ref`
 * attribute and return a compact descriptor list. The agent later targets these
 * refs (e1, e2, …) which re-resolve to elements by attribute at action time.
 *
 * `prefix` namespaces the ref per frame so refs stay globally unique across the
 * main document and any iframes (e.g. prefix "f1" → "f1e3"). The empty prefix is
 * the main frame ("e3"). The `[role="option/listbox/combobox"]` selectors expose
 * custom (non-native) dropdowns so the agent can operate them.
 */
export function collectInteractiveElements(arg: { max: number; prefix: string }): SnapshotElement[] {
	const { max, prefix } = arg;
	const selector =
		'a,button,input,select,textarea,[role="button"],[role="link"],[role="checkbox"],' +
		'[role="tab"],[role="menuitem"],[role="combobox"],[role="listbox"],[role="option"],' +
		'[contenteditable="true"],[contenteditable=""]';
	const nodes = Array.from(document.querySelectorAll(selector));
	const out: SnapshotElement[] = [];
	let i = 0;
	for (const el of nodes) {
		const node = el as HTMLElement;
		if (node.getClientRects().length === 0) continue; // not rendered / hidden
		if ((node as HTMLButtonElement).disabled) continue;
		if (out.length >= max) break;
		const ref = prefix + 'e' + ++i;
		node.setAttribute('data-ai-ref', ref);
		const tag = node.tagName.toLowerCase();
		const role = node.getAttribute('role') ?? tag;
		const input = node as HTMLInputElement;
		const name = (
			node.getAttribute('aria-label') ||
			node.textContent?.trim() ||
			input.placeholder ||
			input.name ||
			input.value ||
			''
		)
			.replace(/\s+/g, ' ')
			.slice(0, 120);
		const type = input.type && tag === 'input' ? input.type : '';
		out.push({ ref, role, name, type });
	}
	return out;
}

/** Return the page's readable body text. */
export function readBodyText(): string {
	return document.body?.innerText ?? '';
}

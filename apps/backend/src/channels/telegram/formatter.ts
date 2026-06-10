/**
 * Telegram message formatter — converts standard Markdown (LLM output) into
 * Telegram-flavoured HTML for the `parse_mode: 'HTML'` send option.
 *
 * Why HTML and not MarkdownV2:
 *   MarkdownV2 requires every one of `_ * [ ] ( ) ~ \` > # + - = | { } . !`
 *   to be backslash-escaped *outside* entities and is extremely easy to get
 *   wrong — a single unbalanced/unescaped char makes Telegram reject the whole
 *   message with HTTP 400, after which the bot fell back to sending raw,
 *   literal Markdown. Telegram's HTML mode only needs `& < >` escaped in text
 *   and uses a small, well-defined tag set, so it is far more reliable.
 *
 * Supported conversions:
 *   **bold** / __bold__        → <b>bold</b>
 *   *italic* / _italic_        → <i>italic</i>
 *   ~~strike~~                 → <s>strike</s>
 *   `code`                     → <code>code</code>
 *   ```lang\ncode```           → <pre><code class="language-lang">code</code></pre>
 *   [text](url)                → <a href="url">text</a>
 *   # Heading                  → <b>Heading</b>
 *   - / * bullet               → • bullet
 *
 * Telegram supported tags: b, i, u, s, a, code, pre, blockquote, tg-spoiler.
 * Anything not recognised is emitted as escaped plain text.
 */

import { chunkText } from '../text-chunk.js';

/** Sentinel byte used to stash already-rendered HTML out of harm's way */
const NULL = '\x00';

/** Telegram hard limit for a single text message */
const TELEGRAM_MAX_LEN = 4096;

/** Escape the three characters that are special in Telegram HTML text nodes. */
function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape a URL for use inside an href="" attribute value. */
function escapeHref(url: string): string {
	return url
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Convert a standard Markdown string to Telegram HTML.
 *
 * Strategy: stash verbatim/already-rendered spans (code, links) behind null
 * sentinels BEFORE escaping, escape the remaining plain text once, then apply
 * inline emphasis conversions on the escaped text (the emphasis markers
 * `* _ ~ #` are never touched by HTML escaping, so they survive intact), and
 * finally restore the stashed spans. This guarantees emphasis markers are
 * never double-escaped — the bug that previously rendered `*bold*` literally.
 */
export function toTelegramHtml(input: string): string {
	const stash: string[] = [];
	const keep = (html: string): string => {
		const idx = stash.length;
		stash.push(html);
		return `${NULL}${idx}${NULL}`;
	};

	// 1. Fenced code blocks — verbatim content, escaped, optional language hint.
	let result = input.replace(
		/```([\w+-]*)\r?\n?([\s\S]*?)```/g,
		(_match, lang: string, code: string) => {
			const body = escapeHtml(code.replace(/\r?\n$/, ''));
			return keep(
				lang ? `<pre><code class="language-${lang}">${body}</code></pre>` : `<pre>${body}</pre>`,
			);
		},
	);

	// 2. Inline code — verbatim content, escaped.
	result = result.replace(/`([^`\n]+)`/g, (_match, code: string) =>
		keep(`<code>${escapeHtml(code)}</code>`),
	);

	// 3. Links — captured before escaping so the URL stays intact.
	result = result.replace(
		/\[([^\]]*)\]\(([^()\s]+)\)/g,
		(_match, text: string, url: string) => keep(`<a href="${escapeHref(url)}">${escapeHtml(text)}</a>`),
	);

	// 4. Escape the remaining plain text. Stash sentinels (& none of < > here)
	//    and emphasis markers are untouched by this.
	result = escapeHtml(result);

	// 5. Headings (whole line) → bold.
	result = result.replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*$/gm, (_match, text: string) => `<b>${text}</b>`);

	// 6. Emphasis. Bold/strike before italic so the double markers are consumed
	//    first and the single-marker italic pass can't re-match them.
	result = result.replace(/\*\*(?=\S)([^\n]+?)(?<=\S)\*\*/g, (_m, t: string) => `<b>${t}</b>`);
	result = result.replace(/__(?=\S)([^\n]+?)(?<=\S)__/g, (_m, t: string) => `<b>${t}</b>`);
	result = result.replace(/~~(?=\S)([^\n]+?)(?<=\S)~~/g, (_m, t: string) => `<s>${t}</s>`);
	// Italic with `*`: inner must not touch a space (avoids matching `a * b * c`).
	result = result.replace(/\*(?=\S)([^*\n]+?)(?<=\S)\*/g, (_m, t: string) => `<i>${t}</i>`);
	// Italic with `_`: require boundaries so snake_case identifiers are left alone.
	result = result.replace(
		/(^|[\s(])_(?=\S)([^_\n]+?)(?<=\S)_(?=[\s).,!?:;]|$)/g,
		(_m, pre: string, t: string) => `${pre}<i>${t}</i>`,
	);

	// 7. Unordered list markers at line start → bullet glyph.
	result = result.replace(/^([ \t]*)[*+-][ \t]+/gm, '$1• ');

	// 8. Restore stashed spans.
	result = result.replace(
		new RegExp(`${NULL}(\\d+)${NULL}`, 'g'),
		(_m, idx: string) => stash[parseInt(idx, 10)] ?? '',
	);

	return result;
}

/**
 * Split a Markdown string on its SOURCE length so each chunk can be formatted
 * independently into balanced HTML (a chunk never ends mid-tag).
 *
 * Reserves headroom below Telegram's hard limit because HTML escaping/markup
 * expands the text — a formatted chunk must never exceed 4096 characters.
 */
export function splitForTelegram(text: string, maxLen = TELEGRAM_MAX_LEN): string[] {
	return chunkText(text, Math.floor(maxLen * 0.7));
}

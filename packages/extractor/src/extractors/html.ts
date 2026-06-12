import type { ExtractionResult } from '@repo/types';
import { segmentLines } from './text.js';

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
};

function decodeEntities(text: string): string {
	return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
		if (entity.startsWith('#x') || entity.startsWith('#X')) {
			const code = Number.parseInt(entity.slice(2), 16);
			return Number.isNaN(code) ? match : String.fromCodePoint(code);
		}
		if (entity.startsWith('#')) {
			const code = Number.parseInt(entity.slice(1), 10);
			return Number.isNaN(code) ? match : String.fromCodePoint(code);
		}
		return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
	});
}

/** Tags whose end marks a logical block — replaced by paragraph breaks */
const BLOCK_BOUNDARY_PATTERN =
	/<\/(?:p|div|li|tr|h[1-6]|section|article|blockquote|pre|table)>|<br\s*\/?>/gi;

/**
 * Minimal dependency-free HTML → text: drops script/style/head content,
 * converts block boundaries to paragraph breaks, strips remaining tags,
 * decodes common entities, then reuses the plain-text line segmenter.
 */
export function extractHtml(data: Uint8Array): ExtractionResult {
	let html: string;
	try {
		html = new TextDecoder('utf-8', { fatal: true }).decode(data);
	} catch {
		return {
			ok: false,
			errorCode: 'corrupt_file',
			errorMessage: 'File is not valid UTF-8 text.',
		};
	}

	const text = decodeEntities(
		html
			.replace(/<script[\s\S]*?<\/script>/gi, '')
			.replace(/<style[\s\S]*?<\/style>/gi, '')
			.replace(/<head[\s\S]*?<\/head>/gi, '')
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(BLOCK_BOUNDARY_PATTERN, '\n\n')
			.replace(/<[^>]+>/g, ' '),
	)
		.replace(/[ \t]+/g, ' ')
		.replace(/ ?\n ?/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	return { ok: true, format: 'html', segments: segmentLines(text, false), warnings: [] };
}

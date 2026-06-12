import mammoth from 'mammoth';
import { Buffer } from 'node:buffer';
import type { ExtractedSegment, ExtractionResult } from '@repo/types';

/**
 * Paragraphs grouped per segment. DOCX has no intrinsic pages (pagination is
 * a render-time concept), so location is a 1-based paragraph range instead.
 */
const PARAGRAPHS_PER_SEGMENT = 10;

export async function extractDocx(data: Uint8Array): Promise<ExtractionResult> {
	try {
		const result = await mammoth.extractRawText({
			buffer: Buffer.from(data.buffer, data.byteOffset, data.byteLength),
		});
		// mammoth separates paragraphs with blank lines
		const paragraphs = result.value
			.split(/\n{2,}/)
			.map((p) => p.trim())
			.filter((p) => p.length > 0);

		const segments: ExtractedSegment[] = [];
		for (let i = 0; i < paragraphs.length; i += PARAGRAPHS_PER_SEGMENT) {
			const group = paragraphs.slice(i, i + PARAGRAPHS_PER_SEGMENT);
			const start = i + 1;
			const end = i + group.length;
			segments.push({
				location: {
					type: 'section',
					label: start === end ? `Paragraph ${start}` : `Paragraphs ${start}–${end}`,
					start,
					end,
				},
				text: group.join('\n\n'),
			});
		}

		const warnings = result.messages.map((m) => m.message);
		return { ok: true, format: 'docx', segments, warnings };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			errorCode: 'corrupt_file',
			errorMessage: `Failed to parse DOCX: ${message}`,
		};
	}
}

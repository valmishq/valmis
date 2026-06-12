import type { ExtractedFormat, ExtractionInput, ExtractionResult } from '@repo/types';
import { detectFormat } from './detect.js';
import { extractPdf } from './extractors/pdf.js';
import { extractDocx } from './extractors/docx.js';
import { extractXlsx } from './extractors/xlsx.js';
import { extractPptx } from './extractors/pptx.js';
import { extractPlainText } from './extractors/text.js';
import { extractHtml } from './extractors/html.js';

export { chunkSegments } from './chunker.js';
export { detectFormat } from './detect.js';
export type {
	ChunkOptions,
	ExtractedFormat,
	ExtractedSegment,
	ExtractionErrorCode,
	ExtractionInput,
	ExtractionOptions,
	ExtractionResult,
	KnowledgeChunk,
	SegmentLocation,
	SegmentLocationType,
} from '@repo/types';

type FormatHandler = (data: Uint8Array, input: ExtractionInput) => Promise<ExtractionResult>;

/**
 * Per-format handler table. This is the extension point for new formats:
 * a future OCR pass registers handlers for image formats (and an image-only
 * PDF fallback) here, gated on `input.options?.ocr`.
 */
const HANDLERS: Record<ExtractedFormat, FormatHandler> = {
	pdf: (data) => extractPdf(data),
	docx: (data) => extractDocx(data),
	xlsx: (data) => extractXlsx(data),
	pptx: (data) => extractPptx(data),
	text: async (data) => extractPlainText(data, 'text'),
	markdown: async (data) => extractPlainText(data, 'markdown'),
	csv: async (data) => extractPlainText(data, 'csv'),
	json: async (data) => extractPlainText(data, 'json'),
	html: async (data) => extractHtml(data),
};

/**
 * Unified text extractor: takes raw file bytes of any supported format and
 * returns located text segments. Expected failures (unsupported/corrupt/
 * password-protected/empty files) are reported in the result — this function
 * only throws on programmer error.
 */
export async function extractText(input: ExtractionInput): Promise<ExtractionResult> {
	if (input.data.length === 0) {
		return { ok: false, errorCode: 'empty_document', errorMessage: 'The file is empty.' };
	}

	const format = await detectFormat(input.data, input.fileName, input.mimeType);
	if (!format) {
		return {
			ok: false,
			errorCode: 'unsupported_format',
			errorMessage: `Unsupported file format: ${input.fileName}${
				input.mimeType ? ` (${input.mimeType})` : ''
			}. Supported: pdf, docx, xlsx, pptx, txt, md, csv, json, html.`,
		};
	}

	let result: ExtractionResult;
	try {
		result = await HANDLERS[format](input.data, input);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			errorCode: 'extraction_failed',
			errorMessage: `Extraction failed for ${input.fileName}: ${message}`,
		};
	}

	if (result.ok) {
		const segments = result.segments.filter((s) => s.text.trim().length > 0);
		if (segments.length === 0) {
			return {
				ok: false,
				errorCode: 'empty_document',
				errorMessage: 'No extractable text found in the document.',
			};
		}
		return { ...result, segments };
	}
	return result;
}

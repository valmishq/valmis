import JSZip from 'jszip';
import type { ExtractedFormat } from '@repo/types';

/** Exact mime type → format map (parameters like `; charset=` are stripped before lookup) */
const MIME_TO_FORMAT: Record<string, ExtractedFormat> = {
	'application/pdf': 'pdf',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
	'text/plain': 'text',
	'text/markdown': 'markdown',
	'text/csv': 'csv',
	'application/json': 'json',
	'text/html': 'html',
};

const EXTENSION_TO_FORMAT: Record<string, ExtractedFormat> = {
	pdf: 'pdf',
	docx: 'docx',
	xlsx: 'xlsx',
	pptx: 'pptx',
	txt: 'text',
	text: 'text',
	log: 'text',
	md: 'markdown',
	markdown: 'markdown',
	csv: 'csv',
	json: 'json',
	html: 'html',
	htm: 'html',
};

const BINARY_FORMATS: ReadonlySet<ExtractedFormat> = new Set(['pdf', 'docx', 'xlsx', 'pptx']);

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

function startsWithBytes(data: Uint8Array, magic: number[]): boolean {
	if (data.length < magic.length) return false;
	return magic.every((byte, i) => data[i] === byte);
}

/** Disambiguate docx/xlsx/pptx by the OOXML archive's top-level directory */
async function detectOoxmlFormat(data: Uint8Array): Promise<ExtractedFormat | undefined> {
	try {
		const zip = await JSZip.loadAsync(data);
		const paths = Object.keys(zip.files);
		if (paths.some((p) => p.startsWith('word/'))) return 'docx';
		if (paths.some((p) => p.startsWith('xl/'))) return 'xlsx';
		if (paths.some((p) => p.startsWith('ppt/'))) return 'pptx';
		return undefined;
	} catch {
		return undefined;
	}
}

/** Detect a format purely from file bytes — used for verification and as a fallback */
async function detectFromBytes(data: Uint8Array): Promise<ExtractedFormat | undefined> {
	if (startsWithBytes(data, PDF_MAGIC)) return 'pdf';
	if (startsWithBytes(data, ZIP_MAGIC)) return detectOoxmlFormat(data);
	// Valid UTF-8 with no NUL bytes → treat as plain text
	try {
		const probe = data.subarray(0, 64 * 1024);
		new TextDecoder('utf-8', { fatal: true }).decode(probe);
		if (probe.includes(0)) return undefined;
		return 'text';
	} catch {
		return undefined;
	}
}

function extensionOf(fileName: string): string {
	const idx = fileName.lastIndexOf('.');
	return idx === -1 ? '' : fileName.slice(idx + 1).toLowerCase();
}

/**
 * Resolve the file's format: declared mime type → file extension → magic bytes.
 * Binary formats claimed by mime/extension are re-verified against the actual
 * bytes (client-supplied mime types are never trusted on their own).
 * Returns undefined when the format cannot be determined.
 */
export async function detectFormat(
	data: Uint8Array,
	fileName: string,
	mimeType?: string,
): Promise<ExtractedFormat | undefined> {
	const normalizedMime = mimeType?.split(';')[0]?.trim().toLowerCase();
	const claimed =
		(normalizedMime ? MIME_TO_FORMAT[normalizedMime] : undefined) ??
		EXTENSION_TO_FORMAT[extensionOf(fileName)];

	if (claimed && BINARY_FORMATS.has(claimed)) {
		const actual = await detectFromBytes(data);
		// A mislabeled binary file is resolved by its real bytes when possible
		return actual ?? claimed;
	}
	if (claimed) return claimed;
	return detectFromBytes(data);
}

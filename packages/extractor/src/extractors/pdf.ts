import { extractText as unpdfExtractText, getDocumentProxy } from 'unpdf';
import type { ExtractedSegment, ExtractionResult } from '@repo/types';

function isPasswordError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	return err.name === 'PasswordException' || /password/i.test(err.message);
}

/** One segment per page — `location.page` is 1-based */
export async function extractPdf(data: Uint8Array): Promise<ExtractionResult> {
	try {
		// PDF.js may transfer the underlying buffer to its worker — pass a copy
		const pdf = await getDocumentProxy(new Uint8Array(data));
		const { text } = await unpdfExtractText(pdf, { mergePages: false });

		const segments: ExtractedSegment[] = [];
		text.forEach((pageText, i) => {
			const trimmed = pageText.trim();
			if (!trimmed) return;
			const page = i + 1;
			segments.push({
				location: { type: 'page', label: `Page ${page}`, page },
				text: trimmed,
			});
		});

		return { ok: true, format: 'pdf', segments, warnings: [] };
	} catch (err) {
		if (isPasswordError(err)) {
			return {
				ok: false,
				errorCode: 'password_protected',
				errorMessage: 'The PDF is password-protected and cannot be read.',
			};
		}
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			errorCode: 'corrupt_file',
			errorMessage: `Failed to parse PDF: ${message}`,
		};
	}
}

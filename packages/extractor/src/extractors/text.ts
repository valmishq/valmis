import type { ExtractedFormat, ExtractedSegment, ExtractionResult } from '@repo/types';

/** Flush a block once it reaches this many lines and a blank line appears */
const TARGET_LINES_PER_SEGMENT = 80;
/** Hard flush even without a blank-line boundary */
const MAX_LINES_PER_SEGMENT = 120;

interface NumberedLine {
	/** 1-based line number in the original file */
	lineNumber: number;
	text: string;
}

function decodeUtf8(data: Uint8Array): string | undefined {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(data);
	} catch {
		return undefined;
	}
}

/** Group lines into segments, snapping breaks to blank lines where possible */
export function segmentLines(text: string, prependHeaderLine: boolean): ExtractedSegment[] {
	const rawLines = text.split(/\r?\n/);
	const headerLine = rawLines.find((l) => l.trim().length > 0) ?? '';

	const segments: ExtractedSegment[] = [];
	let block: NumberedLine[] = [];

	const flush = (): void => {
		const nonEmpty = block.filter((l) => l.text.trim().length > 0);
		if (nonEmpty.length > 0) {
			const start = nonEmpty[0].lineNumber;
			const end = nonEmpty[nonEmpty.length - 1].lineNumber;
			const lines = block.map((l) => l.text);
			// Re-prepend the header (e.g. CSV column row) so later blocks stay self-describing
			if (prependHeaderLine && start > 1 && headerLine) lines.unshift(headerLine);
			segments.push({
				location: {
					type: 'lines',
					label: start === end ? `Line ${start}` : `Lines ${start}–${end}`,
					start,
					end,
				},
				text: lines.join('\n').trim(),
			});
		}
		block = [];
	};

	rawLines.forEach((line, i) => {
		block.push({ lineNumber: i + 1, text: line });
		const isBlank = line.trim().length === 0;
		if (
			(block.length >= TARGET_LINES_PER_SEGMENT && isBlank) ||
			block.length >= MAX_LINES_PER_SEGMENT
		) {
			flush();
		}
	});
	flush();

	return segments;
}

/** Plain-text family: txt / md / csv / json — location is a 1-based line range */
export function extractPlainText(
	data: Uint8Array,
	format: Extract<ExtractedFormat, 'text' | 'markdown' | 'csv' | 'json'>,
): ExtractionResult {
	const text = decodeUtf8(data);
	if (text === undefined) {
		return {
			ok: false,
			errorCode: 'corrupt_file',
			errorMessage: 'File is not valid UTF-8 text.',
		};
	}
	const segments = segmentLines(text, format === 'csv');
	return { ok: true, format, segments, warnings: [] };
}

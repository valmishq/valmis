import ExcelJS from 'exceljs';
import type { ExtractedSegment, ExtractionResult } from '@repo/types';

/** Rows grouped per segment within each worksheet */
const ROWS_PER_SEGMENT = 50;

interface SheetRow {
	/** 1-based worksheet row number (empty rows are skipped, numbering is preserved) */
	rowNumber: number;
	text: string;
}

function renderRow(row: ExcelJS.Row): string {
	const cells: string[] = [];
	row.eachCell({ includeEmpty: false }, (cell) => {
		const text = cell.text.trim();
		if (text) cells.push(text);
	});
	return cells.join('\t');
}

/**
 * One segment per block of rows, per worksheet. The header row (first
 * non-empty row) is re-prepended to every later block so each chunk stays
 * self-describing.
 */
export async function extractXlsx(data: Uint8Array): Promise<ExtractionResult> {
	try {
		const workbook = new ExcelJS.Workbook();
		// exceljs types its own Buffer as `interface Buffer extends ArrayBuffer {}`,
		// and at runtime load() accepts an ArrayBuffer — copy into a fresh one
		const arrayBuffer = new ArrayBuffer(data.byteLength);
		new Uint8Array(arrayBuffer).set(data);
		await workbook.xlsx.load(arrayBuffer);

		const segments: ExtractedSegment[] = [];
		for (const worksheet of workbook.worksheets) {
			const rows: SheetRow[] = [];
			worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
				const text = renderRow(row);
				if (text) rows.push({ rowNumber, text });
			});
			if (rows.length === 0) continue;

			const headerText = rows[0].text;
			for (let i = 0; i < rows.length; i += ROWS_PER_SEGMENT) {
				const block = rows.slice(i, i + ROWS_PER_SEGMENT);
				const start = block[0].rowNumber;
				const end = block[block.length - 1].rowNumber;
				const lines = block.map((r) => r.text);
				if (i > 0) lines.unshift(headerText);
				segments.push({
					location: {
						type: 'sheet',
						label: `Sheet '${worksheet.name}' rows ${start}–${end}`,
						sheet: worksheet.name,
						start,
						end,
					},
					text: lines.join('\n'),
				});
			}
		}

		return { ok: true, format: 'xlsx', segments, warnings: [] };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			errorCode: 'corrupt_file',
			errorMessage: `Failed to parse XLSX: ${message}`,
		};
	}
}

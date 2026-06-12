import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { ExtractedSegment, ExtractionResult } from '@repo/types';

/** Recursive shape of a fast-xml-parser result (parseTagValue disabled → strings only) */
type XmlNode = string | XmlNode[] | { [key: string]: XmlNode };

const SLIDE_PATH_PATTERN = /^ppt\/slides\/slide(\d+)\.xml$/;

/** Collect every subtree stored under `key`, in document order */
function collectByKey(node: XmlNode, key: string, out: XmlNode[]): void {
	if (typeof node === 'string') return;
	if (Array.isArray(node)) {
		for (const child of node) collectByKey(child, key, out);
		return;
	}
	for (const [k, value] of Object.entries(node)) {
		if (k === key) {
			if (Array.isArray(value)) out.push(...value);
			else out.push(value);
		} else {
			collectByKey(value, key, out);
		}
	}
}

/** Flatten all text runs (`a:t`) under a node into one string */
function collectTextRuns(node: XmlNode): string {
	const runs: XmlNode[] = [];
	collectByKey(node, 'a:t', runs);
	return runs.filter((r): r is string => typeof r === 'string').join('');
}

/**
 * One segment per slide. PPTX is a zip of per-slide XML; text lives in `a:t`
 * runs grouped into `a:p` paragraphs. Speaker notes are not extracted in v1.
 */
export async function extractPptx(data: Uint8Array): Promise<ExtractionResult> {
	try {
		const zip = await JSZip.loadAsync(data);
		const slidePaths = Object.keys(zip.files)
			.map((path) => {
				const match = path.match(SLIDE_PATH_PATTERN);
				return match ? { path, slide: Number(match[1]) } : undefined;
			})
			.filter((entry): entry is { path: string; slide: number } => entry !== undefined)
			.sort((a, b) => a.slide - b.slide);

		const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
		const segments: ExtractedSegment[] = [];

		for (const { path, slide } of slidePaths) {
			const xml = await zip.files[path].async('string');
			const tree = parser.parse(xml) as XmlNode;

			const paragraphNodes: XmlNode[] = [];
			collectByKey(tree, 'a:p', paragraphNodes);
			const paragraphs = paragraphNodes
				.map((p) => collectTextRuns(p).trim())
				.filter((p) => p.length > 0);
			if (paragraphs.length === 0) continue;

			segments.push({
				location: { type: 'slide', label: `Slide ${slide}`, slide },
				text: paragraphs.join('\n\n'),
			});
		}

		if (slidePaths.length === 0) {
			return {
				ok: false,
				errorCode: 'corrupt_file',
				errorMessage: 'No slides found in the PPTX archive.',
			};
		}

		return { ok: true, format: 'pptx', segments, warnings: [] };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			errorCode: 'corrupt_file',
			errorMessage: `Failed to parse PPTX: ${message}`,
		};
	}
}

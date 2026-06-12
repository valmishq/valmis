import type { ChunkOptions, ExtractedSegment, KnowledgeChunk } from '@repo/types';

const DEFAULT_TARGET_WORDS = 400;
const DEFAULT_MAX_WORDS = 600;
const DEFAULT_MIN_WORDS = 40;

/** Sentence boundary: punctuation (incl. CJK full stop) followed by whitespace */
const SENTENCE_BOUNDARY = /(?<=[.!?。])\s+/u;
/** Paragraph boundary: one or more blank lines */
const PARAGRAPH_BOUNDARY = /\n{2,}/;

function countWords(text: string): number {
	return text.split(/\s+/).filter(Boolean).length;
}

/** Hard stopper: split a run of words into groups of at most maxWords */
function hardSplitByWords(text: string, maxWords: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const parts: string[] = [];
	for (let i = 0; i < words.length; i += maxWords) {
		parts.push(words.slice(i, i + maxWords).join(' '));
	}
	return parts;
}

/** Split one paragraph that exceeds maxWords into sentence-bounded (or hard-split) units */
function splitOversizeUnit(unit: string, maxWords: number): string[] {
	const sentences = unit.split(SENTENCE_BOUNDARY).filter((s) => s.trim().length > 0);
	const result: string[] = [];
	for (const sentence of sentences) {
		if (countWords(sentence) > maxWords) {
			result.push(...hardSplitByWords(sentence, maxWords));
		} else {
			result.push(sentence);
		}
	}
	return result.length > 0 ? result : [unit];
}

/**
 * Split extracted segments into embeddable chunks.
 *
 * Stoppers, applied in order: paragraph breaks (blank lines) → sentence
 * boundaries → a hard max-words split. Units are greedily packed up to
 * `targetWords`; a trailing chunk below `minWords` merges into the previous
 * chunk of the same segment. Chunks NEVER cross segment boundaries, so each
 * chunk keeps an unambiguous source location (page / slide / sheet / lines).
 */
export function chunkSegments(
	segments: ExtractedSegment[],
	options: ChunkOptions = {},
): KnowledgeChunk[] {
	const targetWords = options.targetWords ?? DEFAULT_TARGET_WORDS;
	const maxWords = options.maxWords ?? DEFAULT_MAX_WORDS;
	const minWords = options.minWords ?? DEFAULT_MIN_WORDS;

	const chunks: KnowledgeChunk[] = [];

	for (const segment of segments) {
		const text = segment.text.trim();
		if (!text) continue;

		// Build packing units: paragraphs, with oversize ones split down further
		const units: string[] = [];
		for (const paragraph of text.split(PARAGRAPH_BOUNDARY)) {
			const trimmed = paragraph.trim();
			if (!trimmed) continue;
			if (countWords(trimmed) > maxWords) {
				units.push(...splitOversizeUnit(trimmed, maxWords));
			} else {
				units.push(trimmed);
			}
		}

		// Greedy packing up to targetWords
		const segmentChunks: string[] = [];
		let current: string[] = [];
		let currentWords = 0;
		for (const unit of units) {
			const unitWords = countWords(unit);
			if (current.length > 0 && currentWords + unitWords > targetWords) {
				segmentChunks.push(current.join('\n\n'));
				current = [];
				currentWords = 0;
			}
			current.push(unit);
			currentWords += unitWords;
		}
		if (current.length > 0) segmentChunks.push(current.join('\n\n'));

		// Merge an undersized tail into the previous chunk of the same segment
		if (segmentChunks.length > 1) {
			const tail = segmentChunks[segmentChunks.length - 1];
			const prev = segmentChunks[segmentChunks.length - 2];
			if (countWords(tail) < minWords && countWords(prev) + countWords(tail) <= maxWords) {
				segmentChunks.splice(segmentChunks.length - 2, 2, `${prev}\n\n${tail}`);
			}
		}

		for (const content of segmentChunks) {
			chunks.push({ content, location: segment.location, index: chunks.length });
		}
	}

	return chunks;
}

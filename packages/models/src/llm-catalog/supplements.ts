import type { LlmCatalogModel } from '@repo/types';

/**
 * Manually-curated models that models.dev omits or under-covers but that matter
 * to this app. They are merged into the catalog by `transformModelsDev` (so both
 * the generated baseline AND the live overlay include them), keyed by the
 * compound (providerId, id). If models.dev later adds one, the upstream entry
 * wins — supplements only fill gaps, never override.
 *
 * Currently: important Google (Gemini API) text-embedding models. models.dev's
 * `google` provider only lists `gemini-embedding-001`, but the Gemini API also
 * serves these widely-used embedding models, needed for agent memory.
 */

/** Shared shape for a text-in/text-out embedding model. */
function googleEmbedding(
	id: string,
	name: string,
	contextLength: number,
	promptPerToken: string,
): LlmCatalogModel {
	return {
		id,
		providerId: 'google',
		name,
		isEmbeddingModel: true,
		contextLength,
		reasoning: false,
		architecture: {
			modality: 'text->text',
			inputModalities: ['text'],
			outputModalities: ['text'],
			tokenizer: null,
			instructType: null,
		},
		pricing: { promptPerToken, completionPerToken: '0' },
		topProvider: { contextLength, maxCompletionTokens: 1, isModerated: false },
		knowledgeCutoff: null,
	};
}

export const SUPPLEMENTAL_MODELS: LlmCatalogModel[] = [
	// Older but still-served Gemini API embedding model (768 dims). Free tier.
	googleEmbedding('gemini-embedding-2', 'Google Gemini Embedding 2', 8192, '0'),
	// Multilingual embedding model (768 dims). Note: primarily a Vertex model —
	// availability via the Generative Language API key path may vary.
	googleEmbedding(
		'text-multilingual-embedding-002',
		'Google Text Multilingual Embedding 002',
		2048,
		'0',
	),
];

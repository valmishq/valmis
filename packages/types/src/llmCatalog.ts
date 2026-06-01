/**
 * Shared types for the static LLM provider and model catalog.
 * The catalog data lives in @repo/utils; these types are shared across the stack.
 */

/** A supported input/output modality. */
export type LlmModality = 'text' | 'image' | 'audio' | 'video' | 'file' | 'embeddings';

/** Architecture metadata describing a model's input/output capabilities. */
export interface LlmModelArchitecture {
	/** Combined modality string, e.g. "text+image->text" */
	modality: string;
	inputModalities: LlmModality[];
	outputModalities: LlmModality[];
	/** Tokenizer family, e.g. "GPT", "Claude", "Gemini" */
	tokenizer: string | null;
	/** Instruction format if applicable */
	instructType: string | null;
}

/** Per-token pricing in USD. All fields are string-encoded decimals. */
export interface LlmModelPricing {
	/** Cost per input token */
	promptPerToken: string;
	/** Cost per output token */
	completionPerToken: string;
	/** Cost per image token (if applicable) */
	imagePerToken?: string;
	/** Cost per audio token (if applicable) */
	audioPerToken?: string;
	/** Cost per web search call (if applicable) */
	webSearchPerCall?: string;
	/** Cost per internal reasoning token (if applicable) */
	internalReasoningPerToken?: string;
	/** Cache read discount per token (if applicable) */
	cacheReadPerToken?: string;
	/** Cache write cost per token (if applicable) */
	cacheWritePerToken?: string;
}

/** Top-provider constraints for a model. */
export interface LlmModelTopProvider {
	contextLength: number | null;
	maxCompletionTokens: number | null;
	isModerated: boolean;
}

/**
 * A single model in the catalog.
 * `id` matches the format `{providerId}/{model-slug}` and is what gets stored
 * as the `model` field in `llm_provider_configs`.
 */
export interface LlmCatalogModel {
	/** Canonical model identifier, e.g. "openai/gpt-4o" */
	id: string;
	/** Provider ID — matches `LlmCatalogProvider.id` */
	providerId: string;
	/** Human-readable name */
	name: string;
	/** Short description */
	description: string;
	/**
	 * True for vector embedding models; false for chat/completion models.
	 * Embedding models are used for agent memory and cannot be used for conversation.
	 */
	isEmbeddingModel: boolean;
	/** Maximum context window in tokens */
	contextLength: number;
	/** Architecture / modality information */
	architecture: LlmModelArchitecture;
	/** Token pricing */
	pricing: LlmModelPricing;
	/** Top-provider capacity constraints */
	topProvider: LlmModelTopProvider;
	/** ISO date string of the model's knowledge cutoff, or null */
	knowledgeCutoff: string | null;
}

/**
 * A single provider in the catalog.
 * `id` is the prefix used in all of this provider's model IDs.
 */
export interface LlmCatalogProvider {
	/** Unique provider identifier, e.g. "openai" */
	id: string;
	/** Human-readable display name, e.g. "OpenAI" */
	label: string;
	/** Provider homepage URL */
	url: string;
	/**
	 * Whether a custom base URL is required to use this provider
	 * (e.g. self-hosted / OpenAI-compatible endpoints).
	 */
	requiresBaseUrl: boolean;
	/** Placeholder text for the model input field */
	modelPlaceholder: string;
}

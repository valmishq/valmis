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
 *
 * `id` is the BARE native model identifier the provider's own API expects
 * (e.g. "claude-sonnet-4-6", "gpt-5", "gemini-2.5-pro") — NOT a "provider/model"
 * slug. The provider is tracked separately via `providerId` and the
 * `llm_provider_configs.provider` column, so a catalog entry is uniquely keyed
 * by the compound `(providerId, id)`. This is exactly the value stored as the
 * `model` field in `llm_provider_configs` and passed straight to the provider.
 */
export interface LlmCatalogModel {
	/** Bare native model identifier, e.g. "claude-sonnet-4-6" */
	id: string;
	/** Provider ID — matches `LlmCatalogProvider.id` */
	providerId: string;
	/** Human-readable name */
	name: string;
	/** Short description (optional — not all catalog sources provide one) */
	description?: string;
	/**
	 * True for vector embedding models; false for chat/completion models.
	 * Embedding models are used for agent memory and cannot be used for conversation.
	 */
	isEmbeddingModel: boolean;
	/** Maximum context window in tokens */
	contextLength: number;
	/** Whether the model supports a reasoning / extended-thinking mode */
	reasoning?: boolean;
	/** Architecture / modality information */
	architecture: LlmModelArchitecture;
	/** Token pricing */
	pricing: LlmModelPricing;
	/** Top-provider capacity constraints */
	topProvider: LlmModelTopProvider;
	/** Knowledge cutoff date string (e.g. "2025-07-31" or "2024-01"), or null */
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
	/**
	 * Fixed default API base URL for providers that have one (e.g. OpenRouter,
	 * NVIDIA NIM). Used as a fallback when the user does not supply a baseUrl, so
	 * the provider works with just an API key. Omitted for providers whose
	 * endpoint is per-account (Azure) or where the user must pick a region.
	 */
	defaultBaseUrl?: string;
	/**
	 * When true, the provider is selectable but contributes NO catalog models —
	 * the transform skips its model list to keep the generated catalog small.
	 * The UI then falls back to the manual model-id input. Used for providers
	 * with very large/noisy model lists (e.g. NVIDIA, Azure) where the user knows
	 * the exact model id / deployment name.
	 */
	manualModelOnly?: boolean;
}

// ── models.dev raw API shape ────────────────────────────────────────────────
// The upstream catalog at https://models.dev/api.json. Typed here so the
// transform that converts it into LlmCatalogModel never needs `any`/`unknown`.
// The API is keyed by provider id; each provider holds a `models` map keyed by
// the bare native model id.

/** A single model entry in the models.dev API. */
export interface ModelsDevModel {
	/** Bare native model id (also the map key), e.g. "claude-sonnet-4-6" */
	id: string;
	name: string;
	/** Model family, e.g. "claude-sonnet", "text-embedding" */
	family?: string;
	/** Whether the model supports a reasoning / extended-thinking mode */
	reasoning?: boolean;
	tool_call?: boolean;
	/** Knowledge cutoff, e.g. "2025-07-31" or "2024-01" */
	knowledge?: string;
	release_date?: string;
	last_updated?: string;
	modalities?: {
		input?: string[];
		output?: string[];
	};
	limit?: {
		context?: number;
		output?: number;
	};
	/** Pricing in USD per MILLION tokens (note: per-million, not per-token). */
	cost?: {
		input?: number;
		output?: number;
		cache_read?: number;
		cache_write?: number;
	};
}

/** A single provider entry in the models.dev API. */
export interface ModelsDevProvider {
	id: string;
	name: string;
	npm?: string;
	doc?: string;
	env?: string[];
	models: Record<string, ModelsDevModel>;
}

/** The full models.dev API response: a map of provider id → provider. */
export type ModelsDevResponse = Record<string, ModelsDevProvider>;

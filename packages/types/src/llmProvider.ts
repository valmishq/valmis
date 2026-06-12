/** Metadata for an LLM provider config (no secret data) */
export interface LlmProviderConfig {
	id: string;
	ownerId: string;
	/** Free-form provider identifier, e.g. "openai", "anthropic", or any custom string */
	provider: string;
	/** User-defined label, e.g. "My GPT-4o Key" */
	name: string;
	/** Model identifier */
	model: string;
	/** Whether this is the default config used by the agent for this owner */
	isDefault: boolean;
	/**
	 * Whether this config is an embedding model.
	 * True = used for vector memory embeddings; false = used for chat/completion.
	 */
	isEmbeddingModel: boolean;
	createdAt: Date;
	updatedAt: Date;
}

/** The secret payload stored encrypted in the DB */
export interface LlmProviderSecretData {
	apiKey: string;
	/** Optional custom base URL for self-hosted or proxy endpoints */
	baseUrl?: string;
}

/** Input for creating a new LLM provider config */
export interface CreateLlmProviderConfigInput {
	ownerId: string;
	/** Free-form provider identifier */
	provider: string;
	name: string;
	model: string;
	isDefault?: boolean;
	isEmbeddingModel?: boolean;
	data: LlmProviderSecretData;
}

/** Input for updating an existing LLM provider config */
export interface UpdateLlmProviderConfigInput {
	name?: string;
	model?: string;
	isDefault?: boolean;
	isEmbeddingModel?: boolean;
	data?: LlmProviderSecretData;
}

// ─── Request Bodies ───────────────────────────────────────────────────────────

/**
 * POST /v1/llm-providers — create a new LLM provider config.
 * Ownership is derived from the authenticated token, never from the body.
 */
export interface CreateLlmProviderRequestBody {
	provider: string;
	name: string;
	model: string;
	isDefault?: boolean;
	isEmbeddingModel?: boolean;
	data: { apiKey: string; baseUrl?: string };
}

/** PUT /v1/llm-providers/:id — update an existing LLM provider config */
export interface UpdateLlmProviderRequestBody {
	name?: string;
	model?: string;
	isDefault?: boolean;
	isEmbeddingModel?: boolean;
	data?: { apiKey: string; baseUrl?: string };
}

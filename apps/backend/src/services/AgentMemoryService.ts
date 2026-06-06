import { embed } from 'ai';
import type { EmbeddingModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createCohere } from '@ai-sdk/cohere';
import type {
	AgentMemoryEntry,
	AgentMemorySearchResult,
	MemoryWriteRequest,
	MemorySearchRequest,
	MemoryType,
} from '@repo/types';
import { AgentService } from './AgentService.js';
import { LlmProviderService } from './llmProviderService.js';
import { EncryptionService } from './EncryptionService.js';
import { logger } from '../config/logger.js';

/**
 * Strip the provider prefix from a model string.
 *
 * Models in the DB are stored as "<provider>/<model-id>" (e.g. "google/gemini-embedding-2").
 * Each AI SDK provider factory expects only the bare model ID (e.g. "gemini-embedding-2").
 * If the model string contains a `/`, we drop everything up to and including the first `/`.
 *
 * Examples:
 *   "google/gemini-embedding-2"  → "gemini-embedding-2"
 *   "text-embedding-3-small"     → "text-embedding-3-small" (no change)
 *   "openai/text-embedding-3-small" → "text-embedding-3-small"
 */
function stripProviderPrefix(model: string): string {
	const slashIdx = model.indexOf('/');
	return slashIdx !== -1 ? model.slice(slashIdx + 1) : model;
}

/**
 * Builds the correct AI SDK embedding model instance for a given provider + model.
 *
 * Each AI SDK provider factory accepts { apiKey, baseURL? } and returns a typed provider.
 * We use the create* factories so credentials are scoped per-call and never bleed across
 * concurrent requests (unlike the module-level singletons that read from env vars).
 *
 * Supported providers mirror the embedding model catalog in @repo/models.
 */
function buildEmbeddingModel(
	provider: string,
	model: string,
	apiKey: string,
	baseUrl?: string,
): EmbeddingModel {
	// Strip the provider prefix (e.g. "google/gemini-embedding-2" → "gemini-embedding-2")
	// because each AI SDK provider factory expects just the bare model ID.
	const modelId = stripProviderPrefix(model);

	switch (provider.toLowerCase()) {
		case 'openai': {
			const p = createOpenAI({ apiKey, baseURL: baseUrl });
			return p.embedding(modelId);
		}

		case 'google':
		case 'google-generative-ai': {
			const p = createGoogleGenerativeAI({ apiKey });
			return p.embeddingModel(modelId);
		}

		case 'mistral':
		case 'mistralai': {
			const p = createMistral({ apiKey });
			return p.embedding(modelId);
		}

		case 'cohere': {
			const p = createCohere({ apiKey });
			return p.embedding(modelId);
		}

		default: {
			// Fallback: OpenAI-compatible endpoint (e.g. Ollama, Together, Groq, etc.)
			logger.warn(
				{ provider, model: modelId },
				'[memory] unknown embedding provider — attempting OpenAI-compatible fallback',
			);
			const p = createOpenAI({ apiKey, baseURL: baseUrl });
			return p.embedding(modelId);
		}
	}
}

/**
 * AgentMemoryService — host-side memory operations.
 *
 * The agent sandbox cannot call embedding APIs directly (no API keys in the sandbox).
 * This service handles all embedding computation and DB persistence on behalf of the sandbox.
 *
 * Security:
 *   - agentId is always taken from the verified PROXY_TOKEN, never from the request body.
 *   - ownerId is required to resolve the embedding model config (ownership enforced in
 *     LlmProviderService).
 *   - All DB writes go through AgentService which enforces the agentId scope.
 */
export class AgentMemoryService {
	constructor(
		private readonly agentService: AgentService,
		private readonly llmProviderService: LlmProviderService,
		// EncryptionService is held for future direct use; decryption currently delegated
		// to LlmProviderService.getDecryptedData() which owns the key.
		private readonly _encryptionService: EncryptionService,
	) {}

	/**
	 * Generate an embedding vector for the given text using the agent's configured
	 * embedding model. Throws if the model config is missing or has no API key.
	 */
	async embed(text: string, embeddingModelConfigId: string, ownerId: string): Promise<number[]> {
		const modelConfig = await this.llmProviderService.getById(embeddingModelConfigId, ownerId);
		if (!modelConfig) {
			throw new Error(`Embedding model config not found: ${embeddingModelConfigId}`);
		}

		const secretData = await this.llmProviderService.getDecryptedData(
			embeddingModelConfigId,
			ownerId,
		);
		if (!secretData?.apiKey) {
			throw new Error(`No API key configured for embedding model: ${embeddingModelConfigId}`);
		}

		const embeddingModel = buildEmbeddingModel(
			modelConfig.provider,
			modelConfig.model,
			secretData.apiKey,
			secretData.baseUrl ?? undefined,
		);

		const { embedding } = await embed({
			model: embeddingModel,
			value: text,
			maxRetries: 2,
		});

		return embedding;
	}

	/**
	 * Write a new memory entry for an agent.
	 * Embeds the content using the agent's configured embedding model, then persists to DB.
	 */
	async writeMemory(
		agentId: string,
		ownerId: string,
		request: MemoryWriteRequest,
	): Promise<AgentMemoryEntry> {
		const agent = await this.agentService.getById(agentId, ownerId);
		if (!agent) {
			throw new Error(`Agent not found: ${agentId}`);
		}
		if (!agent.embeddingModelConfigId) {
			throw new Error(
				`Agent ${agentId} has no embedding model configured. ` +
					`Assign an embedding model in the agent settings to enable memory tools.`,
			);
		}

		logger.debug(
			{ agentId, memoryType: request.memoryType, contentLength: request.content.length },
			'[memory] embedding memory content',
		);

		const embedding = await this.embed(request.content, agent.embeddingModelConfigId, ownerId);

		const entry = await this.agentService.addMemory({
			agentId,
			content: request.content,
			embedding,
			memoryType: request.memoryType,
			threadId: request.threadId,
			metadata: request.metadata,
		});

		logger.info(
			{ agentId, memoryId: entry.id, memoryType: entry.memoryType },
			'[memory] memory entry written',
		);

		return entry;
	}

	/**
	 * Search an agent's memory by semantic similarity.
	 * Embeds the query string and returns the closest entries (cosine distance).
	 */
	async searchMemory(
		agentId: string,
		ownerId: string,
		request: MemorySearchRequest,
	): Promise<AgentMemorySearchResult[]> {
		const agent = await this.agentService.getById(agentId, ownerId);
		if (!agent) {
			throw new Error(`Agent not found: ${agentId}`);
		}
		if (!agent.embeddingModelConfigId) {
			throw new Error(
				`Agent ${agentId} has no embedding model configured. ` +
					`Assign an embedding model in the agent settings to enable memory tools.`,
			);
		}

		const topK = Math.min(request.topK ?? 5, 20);

		logger.debug(
			{ agentId, memoryType: request.memoryType, topK, query: request.query.slice(0, 80) },
			'[memory] embedding search query',
		);

		const queryEmbedding = await this.embed(request.query, agent.embeddingModelConfigId, ownerId);

		const entries = await this.agentService.searchMemory({
			agentId,
			queryEmbedding,
			memoryType: request.memoryType as MemoryType | undefined,
			threadId: request.threadId,
			limit: topK,
		});

		// pgvector <=> returns cosine distance (0=identical, 2=opposite).
		// The Drizzle SELECT does not expose the raw distance column.
		// We assign rank-based pseudo-similarity descending from 1.0 for now.
		// A follow-up can add a raw SQL select with the actual distance value.
		const results: AgentMemorySearchResult[] = entries.map((entry, idx) => ({
			...entry,
			similarity: Math.max(0, 1 - idx * 0.05),
		}));

		logger.info(
			{ agentId, resultCount: results.length, memoryType: request.memoryType },
			'[memory] memory search complete',
		);

		return results;
	}
}

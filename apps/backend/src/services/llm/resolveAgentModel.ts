import type { Model } from '@earendil-works/pi-ai';
import { resolveProviderApi } from '@repo/utils';
import { LLM_MODELS } from '@repo/models';
import { AgentService } from '../AgentService.js';
import { LlmProviderService } from '../LlmProviderService.js';
import { logger } from '../../config/logger.js';

/** A pi-ai Model plus its decrypted API key (kept separate — never stored on the model) */
export interface ResolvedAgentModel {
	model: Model<string>;
	apiKey: string;
}

/**
 * Resolve the pi-ai Model and decrypted API key for an agent's chat model.
 * Shared by AgentLlmProxyService (runtime LLM proxy) and SkillEvolutionService
 * (background reflection calls) so provider/API mapping and catalog pricing
 * resolution stay consistent.
 *
 * The apiKey is returned separately — never stored on the model object — to
 * make it clear that it must be passed explicitly to stream()/complete() options.
 */
export async function resolveAgentModel(
	agentService: AgentService,
	llmProviderService: LlmProviderService,
	agentId: string,
	ownerId: string,
): Promise<ResolvedAgentModel> {
	const agent = await agentService.getById(agentId, ownerId);
	if (!agent) {
		throw new Error(`Agent not found: ${agentId}`);
	}
	if (!agent.modelConfigId) {
		throw new Error(`Agent ${agentId} has no model configured`);
	}

	const config = await llmProviderService.getById(agent.modelConfigId, ownerId);
	if (!config) {
		throw new Error(`LLM config not found: ${agent.modelConfigId}`);
	}

	const secretData = await llmProviderService.getDecryptedData(agent.modelConfigId, ownerId);
	if (!secretData) {
		throw new Error(`Could not decrypt LLM config for agent ${agentId}`);
	}

	logger.debug(
		{ agentId, provider: config.provider, model: config.model },
		'[llm] resolved model config',
	);

	// Map the stored provider string to the pi-ai API identifier using the shared
	// utility from @repo/utils. Centralising the map in one place ensures agent-runner
	// and the backend always agree on the api field of AssistantMessage.
	const api = resolveProviderApi(config.provider);

	// Catalog model IDs use OpenRouter-style "{provider}/{model}" slugs (e.g. "google/gemini-2.5-flash").
	// Native provider APIs (Google, Anthropic, OpenAI, Mistral) expect the bare model name only.
	// Manual entries without a slash (e.g. "gpt-4o") pass through unchanged.
	const nativeModelId = config.model.includes('/')
		? config.model.split('/').slice(1).join('/')
		: config.model;

	// Look up catalog pricing and context window for accurate cost tracking.
	// Try exact match first (catalog uses "provider/model" slugs like "openai/gpt-4o").
	// Fall back to bare model name match for agents configured without the provider prefix
	// (e.g. model stored as "gpt-4o" → matches catalog entry "openai/gpt-4o").
	const catalogEntry =
		LLM_MODELS.find((m) => m.id === config.model) ??
		LLM_MODELS.find((m) => m.id.endsWith('/' + config.model));

	// IMPORTANT: The catalog stores pricing as cost-per-single-token (e.g. 0.000003).
	// pi-ai expects cost-per-MILLION-tokens (e.g. 3.0).
	// Multiply by 1_000_000 to convert.
	const perMillion = (raw: string | undefined): number => {
		if (!raw) return 0;
		const v = parseFloat(raw);
		return isNaN(v) ? 0 : v * 1_000_000;
	};
	const contextWindow = catalogEntry?.contextLength ?? 128000;

	// Declare the model's real input modalities so vision models actually receive
	// image content blocks (e.g. browser screenshots in tool results). Previously
	// hardcoded to ['text'], which made pi-ai strip every image before the request.
	// pi-ai's Model.input only accepts 'text'|'image', so map the catalog's broader
	// modality list down to those and always keep 'text'.
	const inputModalities = (catalogEntry?.architecture?.inputModalities ?? ['text']).filter(
		(m): m is 'text' | 'image' => m === 'text' || m === 'image',
	);
	const modelInput: ('text' | 'image')[] = inputModalities.includes('text')
		? inputModalities
		: ['text', ...inputModalities];

	const model: Model<string> = {
		id: nativeModelId,
		api,
		provider: config.provider,
		name: config.model,
		reasoning: false,
		input: modelInput,
		cost: {
			input: perMillion(catalogEntry?.pricing.promptPerToken),
			output: perMillion(catalogEntry?.pricing.completionPerToken),
			cacheRead: perMillion(catalogEntry?.pricing.cacheReadPerToken),
			cacheWrite: perMillion(catalogEntry?.pricing.cacheWritePerToken),
		},
		contextWindow,
		maxTokens: 4096,
		baseUrl: secretData.baseUrl ?? '',
	};

	return { model, apiKey: secretData.apiKey };
}

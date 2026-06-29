import type { LlmCatalogProvider } from '@repo/types';

/**
 * Curated allowlist of first-party LLM providers.
 *
 * `id` is the provider key as used by models.dev (https://models.dev/api.json)
 * AND the value stored in `llm_provider_configs.provider`. The sync script and
 * the backend live-overlay both filter models.dev down to exactly these keys.
 *
 * Model ids are the bare native ids the provider/pi-ai API expects — which for
 * aggregators (OpenRouter, NVIDIA) legitimately contain slashes (e.g.
 * "anthropic/claude-...", "meta-llama/llama-..."). Slashes are NOT treated as
 * special anywhere; the stored model id is passed through verbatim. pi-ai
 * natively supports all of these APIs (openai-completions / bedrock-converse-stream
 * / azure-openai-responses); see llm-provider-api-map.ts for the mapping.
 */
export const LLM_PROVIDERS: LlmCatalogProvider[] = [
	{
		id: 'openai',
		label: 'OpenAI',
		url: 'https://openai.com',
		requiresBaseUrl: false,
		modelPlaceholder: 'e.g. gpt-5',
	},
	{
		id: 'anthropic',
		label: 'Anthropic',
		url: 'https://anthropic.com',
		requiresBaseUrl: false,
		modelPlaceholder: 'e.g. claude-sonnet-4-6',
	},
	{
		id: 'google',
		label: 'Google',
		url: 'https://ai.google.dev',
		requiresBaseUrl: false,
		modelPlaceholder: 'e.g. gemini-2.5-pro',
	},
	{
		id: 'mistral',
		label: 'Mistral AI',
		url: 'https://mistral.ai',
		requiresBaseUrl: false,
		modelPlaceholder: 'e.g. mistral-large-latest',
	},
	{
		id: 'cohere',
		label: 'Cohere',
		url: 'https://cohere.com',
		requiresBaseUrl: false,
		modelPlaceholder: 'e.g. command-a-03-2025',
	},
	{
		id: 'perplexity',
		label: 'Perplexity',
		url: 'https://perplexity.ai',
		requiresBaseUrl: false,
		modelPlaceholder: 'e.g. sonar-pro',
	},
	{
		id: 'minimax',
		label: 'MiniMax',
		url: 'https://www.minimaxi.com',
		requiresBaseUrl: false,
		modelPlaceholder: 'e.g. minimax-m2',
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		url: 'https://openrouter.ai',
		requiresBaseUrl: false,
		modelPlaceholder: 'e.g. anthropic/claude-sonnet-4.6',
		defaultBaseUrl: 'https://openrouter.ai/api/v1',
	},
	{
		id: 'nvidia',
		label: 'NVIDIA NIM',
		url: 'https://build.nvidia.com',
		requiresBaseUrl: false,
		modelPlaceholder: 'e.g. meta-llama/llama-3.1-405b-instruct',
		defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
		// Huge model list — keep the provider selectable but omit its catalog
		// models (user types the model id manually).
		manualModelOnly: true,
	},
	{
		id: 'amazon-bedrock',
		label: 'Amazon Bedrock',
		url: 'https://aws.amazon.com/bedrock',
		requiresBaseUrl: true,
		modelPlaceholder: 'e.g. anthropic.claude-sonnet-4-5-20250929-v1:0',
		defaultBaseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
	},
	{
		id: 'azure',
		label: 'Azure OpenAI',
		url: 'https://azure.microsoft.com/products/ai-services/openai-service',
		requiresBaseUrl: true,
		modelPlaceholder: 'your deployment name, e.g. gpt-4o',
	},
	{
		id: 'zai',
		label: 'Z.ai (GLM)',
		url: 'https://z.ai',
		requiresBaseUrl: false,
		modelPlaceholder: 'e.g. glm-4.6',
	},
	{
		id: 'deepseek',
		label: 'DeepSeek',
		url: 'https://www.deepseek.com',
		requiresBaseUrl: false,
		modelPlaceholder: 'e.g. deepseek-chat',
	},
	{
		id: 'alibaba',
		label: 'Qwen (Alibaba)',
		url: 'https://qwenlm.github.io',
		requiresBaseUrl: false,
		modelPlaceholder: 'e.g. qwen-max',
	},
	{
		id: 'xai',
		label: 'xAI',
		url: 'https://x.ai',
		requiresBaseUrl: false,
		modelPlaceholder: 'e.g. grok-4',
	},
	{
		id: 'moonshotai',
		label: 'Moonshot AI',
		url: 'https://moonshot.cn',
		requiresBaseUrl: false,
		modelPlaceholder: 'e.g. kimi-k2',
	},
];

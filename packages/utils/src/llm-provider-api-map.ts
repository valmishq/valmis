/**
 * Maps stored provider identifiers to pi-ai API identifiers.
 *
 * This is the single source of truth for provider → pi-ai API mapping.
 * Used by:
 *   - apps/backend/src/services/AgentLlmProxyService.ts  (resolves the API when building the Model object)
 *   - apps/agent-runtime/src/agent-runner.ts             (must mirror the same mapping for AssistantMessage.api)
 *
 * Keeping this in one place prevents the two consumers from drifting out of sync,
 * which would cause malformed LLM requests on second turns for non-OpenAI providers
 * (pi-ai serializes tool-call history differently per API).
 */
export const PROVIDER_TO_PI_API: Record<string, string> = {
	openai: 'openai-responses',
	anthropic: 'anthropic-messages',
	google: 'google-generative-ai',
	mistral: 'mistral-conversations',
	mistralai: 'mistral-conversations',
};

/**
 * Resolve a stored provider string to its pi-ai API identifier.
 * Falls back to 'openai-completions' for providers not in the map
 * (xai, groq, deepseek, openrouter, etc. — all use the OpenAI-compatible completions API).
 */
export function resolveProviderApi(provider: string): string {
	return PROVIDER_TO_PI_API[provider.toLowerCase()] ?? 'openai-completions';
}

import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { LlmProviderConfig } from '@repo/types';
import { LLM_PROVIDERS, LLM_MODELS } from '@repo/utils';

/**
 * Load the current user's LLM provider configs and the static catalog for SSR.
 * The catalog is passed as page data so the browser bundle never imports @repo/utils.
 */
export const load: PageServerLoad = async (event) => {
	const ownerId = event.locals.user?.id;
	let configs: LlmProviderConfig[] = [];

	if (ownerId) {
		const res = await api(`/llm-providers?ownerId=${encodeURIComponent(ownerId)}`, event);
		if (res.ok) {
			const body = await res.json();
			configs = (body.data ?? []) as LlmProviderConfig[];
		}
	}

	return { configs, llmProviders: LLM_PROVIDERS, llmModels: LLM_MODELS };
};

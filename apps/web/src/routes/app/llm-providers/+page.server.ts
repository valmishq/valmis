import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { LlmProviderConfig, LlmCatalogProvider, LlmCatalogModel } from '@repo/types';
import { LLM_PROVIDERS, LLM_MODELS } from '@repo/models';

/**
 * Load the current user's LLM provider configs and the model catalog for SSR.
 *
 * The catalog is fetched from the backend (`GET /llm-providers/catalog`) so the
 * page reflects the live models.dev overlay. The static `@repo/models` baseline
 * is used as a fallback if that call fails — keeping SSR resilient and ensuring
 * the browser bundle never imports `@repo/utils`.
 */
export const load: PageServerLoad = async (event) => {
	const ownerId = event.locals.user?.id;
	let configs: LlmProviderConfig[] = [];
	let llmProviders: LlmCatalogProvider[] = LLM_PROVIDERS;
	let llmModels: LlmCatalogModel[] = LLM_MODELS;

	if (ownerId) {
		const [configsRes, catalogRes] = await Promise.all([
			api('/llm-providers', event),
			api('/llm-providers/catalog', event),
		]);

		if (configsRes.ok) {
			const body = await configsRes.json();
			configs = (body.data ?? []) as LlmProviderConfig[];
		}

		if (catalogRes.ok) {
			const body = await catalogRes.json();
			if (body.data?.providers?.length) llmProviders = body.data.providers;
			if (body.data?.models?.length) llmModels = body.data.models;
		}
	}

	return { configs, llmProviders, llmModels };
};

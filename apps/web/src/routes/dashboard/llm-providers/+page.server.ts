import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { LlmProviderConfig } from '@repo/types';

/**
 * Load the current user's LLM provider configs for SSR.
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

	return { configs };
};

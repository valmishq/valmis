import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { CredentialMetadata, CredentialDefinition, LlmProviderConfig } from '@repo/types';

/**
 * Load credentials, credential definitions, and LLM provider configs
 * for the new agent form.
 */
export const load: PageServerLoad = async (event) => {
	const ownerId = event.locals.user?.id;
	let credentials: CredentialMetadata[] = [];
	let definitions: CredentialDefinition[] = [];
	let llmConfigs: LlmProviderConfig[] = [];

	const defsRes = await api('/credentials/definitions', event);
	if (defsRes.ok) {
		const body = await defsRes.json();
		definitions = (body.data ?? []) as CredentialDefinition[];
	}

	if (ownerId) {
		const [credsRes, llmRes] = await Promise.all([
			api(`/credentials?ownerId=${encodeURIComponent(ownerId)}`, event),
			api(`/llm-providers?ownerId=${encodeURIComponent(ownerId)}`, event)
		]);

		if (credsRes.ok) {
			const body = await credsRes.json();
			credentials = (body.data ?? []) as CredentialMetadata[];
		}

		if (llmRes.ok) {
			const body = await llmRes.json();
			llmConfigs = (body.data ?? []) as LlmProviderConfig[];
		}
	}

	return { credentials, definitions, llmConfigs };
};

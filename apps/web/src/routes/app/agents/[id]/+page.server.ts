import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import { error } from '@sveltejs/kit';
import type {
	Agent,
	CredentialMetadata,
	AgentMemoryEntry,
	CredentialDefinition,
	LlmProviderConfig
} from '@repo/types';

/**
 * Load the agent, credentials, credential definitions, LLM provider configs,
 * and memory entries for the edit page.
 */
export const load: PageServerLoad = async (event) => {
	const ownerId = event.locals.user?.id;
	const agentId = event.params.id;

	if (!ownerId) {
		error(401, 'Not authenticated');
	}

	// Fetch all data in parallel
	const [agentRes, credsRes, defsRes, llmRes, memoryRes] = await Promise.all([
		api(`/agents/${agentId}?ownerId=${encodeURIComponent(ownerId)}`, event),
		api(`/credentials?ownerId=${encodeURIComponent(ownerId)}`, event),
		api('/credentials/definitions', event),
		api(`/llm-providers?ownerId=${encodeURIComponent(ownerId)}`, event),
		api(`/agents/${agentId}/memory?ownerId=${encodeURIComponent(ownerId)}&limit=50`, event)
	]);

	if (!agentRes.ok) {
		error(404, 'Agent not found');
	}

	const agentBody = await agentRes.json();
	const agent = agentBody.data as Agent;

	let credentials: CredentialMetadata[] = [];
	if (credsRes.ok) {
		const body = await credsRes.json();
		credentials = (body.data ?? []) as CredentialMetadata[];
	}

	let definitions: CredentialDefinition[] = [];
	if (defsRes.ok) {
		const body = await defsRes.json();
		definitions = (body.data ?? []) as CredentialDefinition[];
	}

	let llmConfigs: LlmProviderConfig[] = [];
	if (llmRes.ok) {
		const body = await llmRes.json();
		llmConfigs = (body.data ?? []) as LlmProviderConfig[];
	}

	let memory: AgentMemoryEntry[] = [];
	if (memoryRes.ok) {
		const body = await memoryRes.json();
		memory = (body.data ?? []) as AgentMemoryEntry[];
	}

	return { agent, credentials, definitions, llmConfigs, memory };
};

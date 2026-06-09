import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { Agent, AgentMemoryEntry } from '@repo/types';

/**
 * Load the agent and its memory entries for the standalone memory management page.
 * Fetches up to 100 entries (backend max) — pagination can be added if needed.
 */
export const load: PageServerLoad = async (event) => {
	const { id: agentId } = event.params;
	const ownerId = event.locals.user?.id;

	if (!ownerId) {
		throw error(401, 'Unauthorized');
	}

	const [agentRes, memoryRes] = await Promise.all([
		api(`/agents/${agentId}?ownerId=${encodeURIComponent(ownerId)}`, event),
		api(`/agents/${agentId}/memory?ownerId=${encodeURIComponent(ownerId)}&limit=100`, event)
	]);

	if (!agentRes.ok) {
		throw error(404, 'Agent not found');
	}

	const agentBody = await agentRes.json();
	const agent = agentBody.data as Agent;

	let memory: AgentMemoryEntry[] = [];
	if (memoryRes.ok) {
		const memoryBody = await memoryRes.json();
		memory = (memoryBody.data ?? []) as AgentMemoryEntry[];
	}

	return { agent, memory };
};

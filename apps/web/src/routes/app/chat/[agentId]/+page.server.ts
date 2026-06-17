import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { Agent, AgentThread } from '@repo/types';

/**
 * Load the agent and its thread list for the chat home within this agent.
 */
export const load: PageServerLoad = async (event) => {
	const { agentId } = event.params;
	const ownerId = event.locals.user?.id;

	if (!ownerId) {
		throw error(401, 'Unauthorized');
	}

	const [agentRes, threadsRes] = await Promise.all([
		api(`/agents/${agentId}`, event),
		api(`/runtime/${agentId}/threads`, event)
	]);

	if (!agentRes.ok) {
		throw error(404, 'Agent not found');
	}

	const agentBody = await agentRes.json();
	const agent = agentBody.data as Agent;

	let threads: AgentThread[] = [];
	if (threadsRes.ok) {
		const threadsBody = await threadsRes.json();
		threads = (threadsBody.data ?? []) as AgentThread[];
	}

	return {
		agent,
		threads,
		browserAvailable: agent.allowInternetAccess && env.BROWSER_FEATURE_ENABLED === 'true'
	};
};

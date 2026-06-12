import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { Agent, Workflow } from '@repo/types';

/**
 * Load the agent and its workflows list.
 */
export const load: PageServerLoad = async (event) => {
	const { id: agentId } = event.params;
	const ownerId = event.locals.user?.id;

	if (!ownerId) {
		throw error(401, 'Unauthorized');
	}

	const [agentRes, workflowsRes] = await Promise.all([
		api(`/agents/${agentId}`, event),
		api(`/agents/${agentId}/workflows`, event)
	]);

	if (!agentRes.ok) {
		throw error(404, 'Agent not found');
	}

	const agentBody = await agentRes.json();
	const agent = agentBody.data as Agent;

	let workflows: Workflow[] = [];
	if (workflowsRes.ok) {
		const workflowsBody = await workflowsRes.json();
		workflows = (workflowsBody.data ?? []) as Workflow[];
	}

	return { agent, workflows };
};

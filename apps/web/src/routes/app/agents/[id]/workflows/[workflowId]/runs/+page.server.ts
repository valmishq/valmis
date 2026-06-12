import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { Agent, Workflow, WorkflowRun } from '@repo/types';

/**
 * Load the agent, workflow, and its run history.
 */
export const load: PageServerLoad = async (event) => {
	const { id: agentId, workflowId } = event.params;
	const ownerId = event.locals.user?.id;

	if (!ownerId) {
		error(401, 'Unauthorized');
	}

	const [agentRes, workflowRes, runsRes] = await Promise.all([
		api(`/agents/${agentId}`, event),
		api(`/agents/${agentId}/workflows/${workflowId}`, event),
		api(`/agents/${agentId}/workflows/${workflowId}/runs?limit=50&offset=0`, event)
	]);

	if (!agentRes.ok) {
		error(404, 'Agent not found');
	}
	if (!workflowRes.ok) {
		error(404, 'Workflow not found');
	}

	const agent = (await agentRes.json()).data as Agent;
	const workflow = (await workflowRes.json()).data as Workflow;

	let runs: WorkflowRun[] = [];
	if (runsRes.ok) {
		const runsBody = await runsRes.json();
		runs = ((runsBody.data as { runs?: WorkflowRun[] })?.runs ?? []) as WorkflowRun[];
	}

	return { agent, workflow, runs };
};

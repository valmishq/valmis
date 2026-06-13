import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { Agent, Workflow } from '@repo/types';

/**
 * Load every workflow the user owns (across all agents) plus the agent list
 * used for the filter dropdown and per-row agent labels.
 */
export const load: PageServerLoad = async (event) => {
	const ownerId = event.locals.user?.id;
	let workflows: Workflow[] = [];
	let agents: Agent[] = [];

	if (ownerId) {
		const [workflowsRes, agentsRes] = await Promise.all([
			api('/workflows', event),
			api('/agents', event)
		]);

		if (workflowsRes.ok) {
			const body = await workflowsRes.json();
			workflows = (body.data ?? []) as Workflow[];
		}

		if (agentsRes.ok) {
			const body = await agentsRes.json();
			agents = (body.data ?? []) as Agent[];
		}
	}

	// The selected-agent filter is read client-side from the `?agentId=` query
	// param (see +page.svelte), so it is shareable and the breadcrumb reflects it.
	return { workflows, agents };
};

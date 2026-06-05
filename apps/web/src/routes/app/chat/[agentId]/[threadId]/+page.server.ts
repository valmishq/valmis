import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { Agent, AgentThread, AgentMessage } from '@repo/types';

/**
 * Load agent, thread metadata, and initial message history.
 * Messages are loaded SSR so the page hydrates with existing conversation.
 */
export const load: PageServerLoad = async (event) => {
	const { agentId, threadId } = event.params;
	const ownerId = event.locals.user?.id;

	if (!ownerId) {
		throw error(401, 'Unauthorized');
	}

	const [agentRes, threadsRes, messagesRes] = await Promise.all([
		api(`/agents/${agentId}?ownerId=${encodeURIComponent(ownerId)}`, event),
		api(`/runtime/${agentId}/threads`, event),
		api(`/runtime/${agentId}/threads/${threadId}/messages`, event)
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

	// Find current thread metadata from the list
	const thread = threads.find((t) => t.id === threadId);
	if (!thread) {
		throw error(404, 'Thread not found');
	}

	let messages: AgentMessage[] = [];
	if (messagesRes.ok) {
		const messagesBody = await messagesRes.json();
		messages = (messagesBody.data ?? []) as AgentMessage[];
	}

	return { agent, thread, threads, messages };
};

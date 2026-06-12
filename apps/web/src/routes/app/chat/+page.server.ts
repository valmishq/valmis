import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { Agent } from '@repo/types';

/**
 * Load all agents owned by the current user.
 * The chat landing page requires the user to pick an agent before chatting.
 */
export const load: PageServerLoad = async (event) => {
	const ownerId = event.locals.user?.id;
	let agents: Agent[] = [];

	if (ownerId) {
		const res = await api('/agents', event);
		if (res.ok) {
			const body = await res.json();
			agents = (body.data ?? []) as Agent[];
		}
	}

	return { agents };
};

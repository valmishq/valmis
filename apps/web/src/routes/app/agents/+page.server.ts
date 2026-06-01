import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { Agent, CredentialMetadata } from '@repo/types';

/**
 * Load agents and credentials (for display of attached credential names).
 */
export const load: PageServerLoad = async (event) => {
	const ownerId = event.locals.user?.id;
	let agents: Agent[] = [];
	let credentials: CredentialMetadata[] = [];

	if (ownerId) {
		const [agentsRes, credsRes] = await Promise.all([
			api(`/agents?ownerId=${encodeURIComponent(ownerId)}`, event),
			api(`/credentials?ownerId=${encodeURIComponent(ownerId)}`, event)
		]);

		if (agentsRes.ok) {
			const body = await agentsRes.json();
			agents = (body.data ?? []) as Agent[];
		}

		if (credsRes.ok) {
			const body = await credsRes.json();
			credentials = (body.data ?? []) as CredentialMetadata[];
		}
	}

	return { agents, credentials };
};

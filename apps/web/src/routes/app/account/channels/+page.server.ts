import type { PageServerLoad, Actions } from './$types';
import { api } from '$lib/server/api';
import { error, fail } from '@sveltejs/kit';
import type { Agent, ChannelLink, CredentialMetadata } from '@repo/types';

/**
 * Load the channel links list, the user's agents, and all credentials for the "Connect" dialog.
 * The frontend filters credentials by the selected channel's required credentialType.
 */
export const load: PageServerLoad = async (event) => {
	const ownerId = event.locals.user?.id;
	if (!ownerId) throw error(401, 'Unauthorized');

	const [linksRes, agentsRes, credsRes] = await Promise.all([
		event.fetch('/api/v1/channels/links', {
			headers: { Authorization: `Bearer ${event.cookies.get('accessToken') ?? ''}` }
		}),
		event.fetch(`/api/v1/agents?ownerId=${encodeURIComponent(ownerId)}`, {
			headers: { Authorization: `Bearer ${event.cookies.get('accessToken') ?? ''}` }
		}),
		event.fetch(`/api/v1/credentials?ownerId=${encodeURIComponent(ownerId)}`, {
			headers: { Authorization: `Bearer ${event.cookies.get('accessToken') ?? ''}` }
		})
	]);

	let links: ChannelLink[] = [];
	if (linksRes.ok) {
		const body = await linksRes.json();
		links = (body.data ?? []) as ChannelLink[];
	}

	let agents: Agent[] = [];
	if (agentsRes.ok) {
		const body = await agentsRes.json();
		agents = (body.data ?? []) as Agent[];
	}

	// Pass ALL credentials to the frontend — it filters by channel's required credentialType
	let credentials: CredentialMetadata[] = [];
	if (credsRes.ok) {
		const body = await credsRes.json();
		credentials = (body.data ?? []) as CredentialMetadata[];
	}

	return { links, agents, credentials };
};

export const actions: Actions = {
	/**
	 * Generate a 6-character one-time pairing code.
	 * Form data: { channel, agentId, credentialId? }
	 */
	generateCode: async (event) => {
		const ownerId = event.locals.user?.id;
		if (!ownerId) return fail(401, { error: 'Unauthorized' });

		const data = await event.request.formData();
		const channel = data.get('channel') as string;
		const agentId = data.get('agentId') as string;
		const credentialId = (data.get('credentialId') as string | null) ?? undefined;

		if (!channel || !agentId) {
			return fail(400, { error: 'channel and agentId are required' });
		}

		try {
			const res = await api('/channels/pairing-codes', event, {
				method: 'POST',
				body: JSON.stringify({ channel, agentId, credentialId })
			});

			const body = await res.json();
			return {
				success: true,
				code: body.data.code as string,
				expiresAt: body.data.expiresAt as string,
				channel
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to generate pairing code';
			return fail(500, { error: message });
		}
	},

	/**
	 * Update mutable settings for a channel link.
	 * Form data: { linkId, agentId?, threadMode?, notifyToolUsage }
	 */
	updateLink: async (event) => {
		const ownerId = event.locals.user?.id;
		if (!ownerId) return fail(401, { error: 'Unauthorized' });

		const data = await event.request.formData();
		const linkId = data.get('linkId') as string;
		if (!linkId) return fail(400, { error: 'linkId is required' });

		const agentId = data.get('agentId') as string | null;
		const threadMode = data.get('threadMode') as string | null;
		const notifyToolUsage = data.get('notifyToolUsage') === 'true';

		const updates: Record<string, unknown> = { notifyToolUsage };
		if (agentId) updates.agentId = agentId;
		if (threadMode) updates.threadMode = threadMode;

		try {
			await api(`/channels/links/${linkId}`, event, {
				method: 'PATCH',
				body: JSON.stringify(updates)
			});
			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to update channel link';
			return fail(500, { error: message });
		}
	},

	/**
	 * Delete (unpair) a channel link.
	 * Form data: { linkId }
	 */
	deleteLink: async (event) => {
		const ownerId = event.locals.user?.id;
		if (!ownerId) return fail(401, { error: 'Unauthorized' });

		const data = await event.request.formData();
		const linkId = data.get('linkId') as string;
		if (!linkId) return fail(400, { error: 'linkId is required' });

		try {
			await api(`/channels/links/${linkId}`, event, { method: 'DELETE' });
			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to unpair channel';
			return fail(500, { error: message });
		}
	}
};

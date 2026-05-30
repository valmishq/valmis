import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { CredentialMetadata, CredentialDefinition } from '@repo/types';

/**
 * Load credential definitions (available types) and the user's existing
 * credential instances for SSR.
 */
export const load: PageServerLoad = async (event) => {
	const [defsRes, credsRes] = await Promise.all([
		api('/credentials/definitions', event),
		api('/credentials', event)
	]);

	const definitions: CredentialDefinition[] = defsRes.ok ? ((await defsRes.json()).data ?? []) : [];

	// Credentials list requires ownerId — re-fetch with ownerId from locals
	const ownerId = event.locals.user?.id;
	let credentials: CredentialMetadata[] = [];
	if (ownerId) {
		const credsWithOwner = await api(`/credentials?ownerId=${encodeURIComponent(ownerId)}`, event);
		if (credsWithOwner.ok) {
			const body = await credsWithOwner.json();
			credentials = (body.data ?? []) as CredentialMetadata[];
		}
	}

	// Suppress unused variable — definitions fetch without ownerId is not needed
	void credsRes;

	return { definitions, credentials };
};

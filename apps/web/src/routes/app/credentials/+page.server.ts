import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import { APP_URL } from '$env/static/private';
import type { CredentialMetadata, CredentialDefinition } from '@repo/types';

/**
 * Load credential definitions (available types) and the user's existing
 * credential instances for SSR. Also passes through OAuth result query params
 * so the page can display a success/error alert after an OAuth2 callback redirect.
 */
export const load: PageServerLoad = async (event) => {
	const ownerId = event.locals.user?.id ?? '';

	const [defsRes, credsRes] = await Promise.all([
		api('/credentials/definitions', event),
		api(`/credentials?ownerId=${encodeURIComponent(ownerId)}`, event)
	]);

	const definitions: CredentialDefinition[] = defsRes.ok ? ((await defsRes.json()).data ?? []) : [];
	const credentials: CredentialMetadata[] = credsRes.ok ? ((await credsRes.json()).data ?? []) : [];

	// Pass OAuth2 callback result (set by the oauth2/callback redirect)
	const oauthResult = event.url.searchParams.get('oauth') as 'success' | 'error' | null;
	const oauthMessage = event.url.searchParams.get('message') ?? undefined;

	// Build the callback URL from APP_URL so the OAuth2 form can display it to the user.
	const appUrl = APP_URL?.replace(/\/+$/, '') ?? '';
	const oauthCallbackUrl = appUrl ? `${appUrl}/oauth2/callback` : null;

	return { definitions, credentials, oauthResult, oauthMessage, oauthCallbackUrl };
};

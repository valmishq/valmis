import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';

/**
 * Universal OAuth2 callback landing page for all credential providers.
 *
 * This route lives outside /app/ so it has no authentication guard.
 * OAuth providers redirect here after authorization. This load function:
 * 1. Reads `code`, `state`, and `error` from the URL query params.
 * 2. Forwards them to the backend `GET /v1/oauth2/callback` which handles
 *    the provider-agnostic code-for-token exchange and stores the tokens.
 * 3. Returns the result to the page.
 *
 * Unlike a plain redirect, the result is returned so the client (+page.svelte)
 * can decide how to finish: when authorization was started from a popup (the
 * in-dialog "Connect account" flow) it posts the result back to the opener and
 * closes; otherwise (the credentials list flow) it redirects to /app/credentials.
 */
export const load: PageServerLoad = async (event) => {
	const code = event.url.searchParams.get('code');
	const state = event.url.searchParams.get('state');
	const error = event.url.searchParams.get('error');

	// If the OAuth provider returned an error, report it
	if (error) {
		return { status: 'error' as const, message: error };
	}

	// If required params are missing, report a generic error
	if (!code || !state) {
		return { status: 'error' as const, message: 'Missing code or state from OAuth provider' };
	}

	// Forward the code and state to the backend callback endpoint.
	// The backend identifies the provider via the state parameter (which encodes
	// the credentialId) and performs the token exchange accordingly.
	const params = new URLSearchParams({ code, state });
	const res = await api(`/oauth2/callback?${params.toString()}`, event);

	if (res.ok) {
		return { status: 'success' as const };
	}

	// Extract error message from backend response
	let message = 'Token exchange failed';
	try {
		const body = await res.json();
		if (body.error) {
			message = body.error;
		}
	} catch {
		// Use the default message
	}

	return { status: 'error' as const, message };
};

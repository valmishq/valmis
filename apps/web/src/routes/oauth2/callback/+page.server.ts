import { redirect } from '@sveltejs/kit';
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
 * 3. Redirects the browser to /app/credentials with a result query param.
 *
 * The page never renders — it always throws a redirect.
 */
export const load: PageServerLoad = async (event) => {
	const code = event.url.searchParams.get('code');
	const state = event.url.searchParams.get('state');
	const error = event.url.searchParams.get('error');

	// If the OAuth provider returned an error, redirect with the error message
	if (error) {
		const message = encodeURIComponent(error);
		throw redirect(303, `/app/credentials?oauth=error&message=${message}`);
	}

	// If required params are missing, redirect with a generic error
	if (!code || !state) {
		const message = encodeURIComponent('Missing code or state from OAuth provider');
		throw redirect(303, `/app/credentials?oauth=error&message=${message}`);
	}

	// Forward the code and state to the backend callback endpoint.
	// The backend identifies the provider via the state parameter (which encodes
	// the credentialId) and performs the token exchange accordingly.
	const params = new URLSearchParams({ code, state });
	const res = await api(`/oauth2/callback?${params.toString()}`, event);

	if (res.ok) {
		throw redirect(303, '/app/credentials?oauth=success');
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

	throw redirect(303, `/app/credentials?oauth=error&message=${encodeURIComponent(message)}`);
};

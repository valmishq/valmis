import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

const BASE_URL = '/api/v1';

/**
 * Server-side API client for use in SvelteKit load functions and form actions.
 * Reads the access token from the cookie store and uses event.fetch so Vite's
 * dev proxy is respected.
 *
 * Throws a SvelteKit error() on non-OK responses so they properly propagate
 * to the nearest +error.svelte page.
 */
export const api = async (
	url: string,
	event: RequestEvent,
	options: RequestInit = {}
): Promise<Response> => {
	const token = event.cookies.get('accessToken');
	const response = await event.fetch(`${BASE_URL}${url}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...(options.headers as Record<string, string>)
		}
	});

	// Throw SvelteKit error on non-OK responses so they propagate to +error.svelte
	if (!response.ok) {
		let errorMessage = 'An error occurred';
		try {
			const json = await response.json();
			if (json.error && typeof json.error === 'string') {
				errorMessage = json.error;
			}
		} catch {
			// If response is not JSON or parsing fails, use default message
			errorMessage = response.statusText || errorMessage;
		}
		throw error(response.status, errorMessage);
	}

	return response;
};

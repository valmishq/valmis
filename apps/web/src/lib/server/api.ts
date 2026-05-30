import type { RequestEvent } from '@sveltejs/kit';

const BASE_URL = '/api/v1';

/**
 * Server-side API client for use in SvelteKit load functions and form actions.
 * Reads the access token from the cookie store and uses event.fetch so Vite's
 * dev proxy is respected.
 */
export const api = async (
	url: string,
	event: RequestEvent,
	options: RequestInit = {}
): Promise<Response> => {
	const token = event.cookies.get('accessToken');
	return event.fetch(`${BASE_URL}${url}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...(options.headers as Record<string, string>)
		}
	});
};

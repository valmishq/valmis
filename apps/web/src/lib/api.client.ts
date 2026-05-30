import { get } from 'svelte/store';
import { authStore } from '$lib/stores/auth.store.js';

const BASE_URL = '/api/v1';

/**
 * Client-side API client for use in <script> event handlers.
 * Reads the access token from the auth store.
 */
export const api = async (url: string, options: RequestInit = {}): Promise<Response> => {
	const { accessToken } = get(authStore);
	return fetch(`${BASE_URL}${url}`, {
		...options,
		headers: {
			// Skip Content-Type for FormData — browser sets the multipart boundary
			...(!(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
			...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
			...(options.headers as Record<string, string>)
		}
	});
};

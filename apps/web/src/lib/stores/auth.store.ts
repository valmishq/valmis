import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { User } from '@repo/types';

interface AuthState {
	accessToken: string | null;
	user: Omit<User, 'password'> | null;
}

const createAuthStore = () => {
	const { subscribe, set } = writable<AuthState>({
		accessToken: null,
		user: null
	});

	return {
		subscribe,

		/** Called after a successful login — stores the token in a cookie for SSR. */
		login: (accessToken: string, user: Omit<User, 'password'>) => {
			if (browser) {
				// samesite=strict prevents CSRF. Add 'secure' in production.
				document.cookie = `accessToken=${accessToken}; path=/; max-age=604800; samesite=strict`;
			}
			set({ accessToken, user });
		},

		/** Clears the token cookie and resets state. */
		logout: () => {
			if (browser) {
				document.cookie = 'accessToken=; path=/; max-age=-1; samesite=strict';
			}
			set({ accessToken: null, user: null });
		},

		/**
		 * Called in the root layout to hydrate the client store from server-loaded
		 * data after SSR, keeping the client and server in sync.
		 */
		syncWithServer: (user: Omit<User, 'password'> | null, accessToken: string | null) => {
			set(user && accessToken ? { accessToken, user } : { accessToken: null, user: null });
		}
	};
};

export const authStore = createAuthStore();

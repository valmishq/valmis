import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'chat_show_usage';

/** Returns the persisted preference for showing the token/cost bar. Defaults to true. */
function getInitialShowUsage(): boolean {
	if (!browser) return true;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'false') return false;
	return true;
}

const createChatPrefsStore = () => {
	const { subscribe, set, update } = writable<boolean>(getInitialShowUsage());

	return {
		subscribe,

		/** Toggle the token/cost bar visibility and persist the choice. */
		toggleShowUsage: () => {
			update((current) => {
				const next = !current;
				if (browser) {
					localStorage.setItem(STORAGE_KEY, String(next));
				}
				return next;
			});
		},

		/** Apply the persisted preference — call this on mount. */
		init: () => {
			const value = getInitialShowUsage();
			set(value);
		}
	};
};

/** Persistent store for chat UI preferences. */
export const chatPrefsStore = createChatPrefsStore();

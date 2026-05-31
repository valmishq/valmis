import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'theme';

/** Reads the persisted theme preference from localStorage. Defaults to 'light'. */
function getInitialTheme(): 'light' | 'dark' {
	if (!browser) return 'light';
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'dark' || stored === 'light') return stored;
	// Fall back to system preference
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const createThemeStore = () => {
	const { subscribe, set, update } = writable<'light' | 'dark'>(getInitialTheme());

	return {
		subscribe,

		/** Toggle between light and dark mode. */
		toggle: () => {
			update((current) => {
				const next = current === 'dark' ? 'light' : 'dark';
				if (browser) {
					localStorage.setItem(STORAGE_KEY, next);
					document.documentElement.classList.toggle('dark', next === 'dark');
				}
				return next;
			});
		},

		/** Set a specific theme. */
		setTheme: (theme: 'light' | 'dark') => {
			if (browser) {
				localStorage.setItem(STORAGE_KEY, theme);
				document.documentElement.classList.toggle('dark', theme === 'dark');
			}
			set(theme);
		},

		/** Apply the current theme to the DOM — call this on mount. */
		init: () => {
			const theme = getInitialTheme();
			if (browser) {
				document.documentElement.classList.toggle('dark', theme === 'dark');
			}
			set(theme);
		}
	};
};

export const themeStore = createThemeStore();

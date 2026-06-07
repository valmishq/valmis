import { writable } from 'svelte/store';

/**
 * Holds an override for the active thread title shown in the breadcrumb.
 *
 * The thread page writes to this store when:
 *   - a thread is first loaded (from page data)
 *   - the user renames the thread (optimistic update)
 *
 * The breadcrumb reads this value instead of page.data.thread.title so that
 * rename changes are reflected immediately without a page reload.
 *
 * Set to null to fall back to page.data.thread.title.
 */
export const activeBreadcrumbThreadTitle = writable<string | null>(null);

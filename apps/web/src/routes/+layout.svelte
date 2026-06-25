<script lang="ts">
	import './layout.css';
	import { authStore } from '$lib/stores/auth.store.js';
	import { themeStore } from '$lib/stores/theme.store.js';
	import type { LayoutData } from './$types';
	import { getAlert } from '$lib/components/custom/alert/alert-state.svelte';
	import Alerts from '$lib/components/custom/alert/Alerts.svelte';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	// Hydrate client-side auth store from server-loaded data after SSR
	$effect(() => {
		authStore.syncWithServer(data.user, data.accessToken);
	});

	// Apply persisted theme preference to the DOM on mount
	$effect(() => {
		themeStore.init();
	});
</script>

<Alerts {...getAlert()}></Alerts>
<svelte:head><link rel="icon" href="/valmis/favicon.svg" /></svelte:head>
{@render children()}

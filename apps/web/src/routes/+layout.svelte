<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { authStore } from '$lib/stores/auth.store.js';
	import type { LayoutData } from './$types';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	// Hydrate client-side auth store from server-loaded data after SSR
	$effect(() => {
		authStore.syncWithServer(data.user, data.accessToken);
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}

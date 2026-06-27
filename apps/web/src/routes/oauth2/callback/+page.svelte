<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	onMount(() => {
		const { status, message } = data;

		// Popup flow (in-dialog "Connect account"): post the result back to the
		// opener window and close. Same-origin only — the callback page is served
		// by this app, so the opener shares our origin.
		if (window.opener && window.opener !== window) {
			window.opener.postMessage(
				{ source: 'valmis-oauth2', status, message },
				window.location.origin
			);
			window.close();
			return;
		}

		// Full-page flow (credentials list "Connect account"): redirect to the
		// credentials page with a result query param so it shows the alert and
		// refreshes the list — functionally identical to the previous behavior.
		const params = new URLSearchParams({ oauth: status });
		if (message) params.set('message', message);
		goto(`/app/credentials?${params.toString()}`);
	});
</script>

<svelte:head>
	<title>Completing authorization — Valmis</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
	<LoaderIcon class="size-6 animate-spin text-muted-foreground" />
	<p class="text-sm text-muted-foreground">Completing authorization…</p>
</div>

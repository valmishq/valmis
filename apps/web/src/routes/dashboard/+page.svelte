<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Dashboard</title>
	<meta name="description" content="Application dashboard" />
</svelte:head>

<h1 class="mb-2 text-xl font-semibold text-gray-900">
	Welcome{data.user.first_name ? `, ${data.user.first_name}` : ''}
</h1>
<p class="text-sm text-gray-500">You are signed in as <strong>{data.user.email}</strong>.</p>

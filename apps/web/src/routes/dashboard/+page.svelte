<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import KeyIcon from '@lucide/svelte/icons/key';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** Quick-link cards shown on the dashboard home */
	const quickLinks = [
		{
			title: 'API Keys',
			description: 'Generate and manage API keys for programmatic access.',
			href: '/dashboard/api-keys',
			icon: KeyIcon
		}
	];
</script>

<svelte:head>
	<title>Dashboard — OpenAgent</title>
	<meta
		name="description"
		content="Manage your OpenAgent integrations, API keys, and settings from the dashboard."
	/>
	<meta name="keywords" content="dashboard, integrations, API keys, OpenAgent" />
</svelte:head>

<PageHeader
	title={data.user.first_name ? `Welcome, ${data.user.first_name}` : 'Welcome'}
	description="Signed in as {data.user.email}"
/>

<!-- Quick-link cards -->
<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
	{#each quickLinks as link (link.title)}
		<a href={link.href} class="group block">
			<Card.Root class="h-full transition-shadow duration-150 group-hover:shadow-md">
				<Card.Header class="pb-3">
					<div class="mb-2 flex size-9 items-center justify-center rounded-md bg-muted">
						<link.icon class="size-4 text-muted-foreground" />
					</div>
					<Card.Title class="text-sm font-medium">{link.title}</Card.Title>
					<Card.Description class="text-xs">{link.description}</Card.Description>
				</Card.Header>
			</Card.Root>
		</a>
	{/each}
</div>

<script lang="ts">
	import { goto } from '$app/navigation';
	import AgentCard from '$lib/components/custom/chat/AgentCard.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import BotIcon from '@lucide/svelte/icons/bot';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Chat — Valmis</title>
	<meta
		name="description"
		content="Choose an AI agent to start a conversation. Chat with your custom agents powered by Valmis."
	/>
	<meta name="keywords" content="AI chat, agent chat, Valmis, conversation, AI assistant" />
</svelte:head>

<PageHeader title="Chat" description="Select an agent to start a conversation." />

{#if data.agents.length === 0}
	<!-- Empty state -->
	<div class="flex flex-col items-center gap-4 py-16 text-center">
		<div
			class="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
		>
			<BotIcon class="size-7" />
		</div>
		<div>
			<p class="text-sm font-medium text-foreground">No agents yet</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Create an agent first before starting a chat.
			</p>
		</div>
		<Button onclick={() => goto('/app/agents/new')} class="gap-2">
			<PlusIcon class="size-4" />
			Create your first agent
		</Button>
	</div>
{:else}
	<!-- Agent grid -->
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
		{#each data.agents as agent (agent.id)}
			<AgentCard {agent} />
		{/each}
	</div>
{/if}

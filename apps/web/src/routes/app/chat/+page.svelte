<script lang="ts">
	import { goto } from '$app/navigation';
	import AgentAvatar from '$lib/components/custom/chat/AgentAvatar.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import BotIcon from '@lucide/svelte/icons/bot';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Chat — OpenAgent</title>
	<meta
		name="description"
		content="Choose an AI agent to start a conversation. Chat with your custom agents powered by OpenAgent."
	/>
	<meta name="keywords" content="AI chat, agent chat, OpenAgent, conversation, AI assistant" />
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
			<button
				type="button"
				class="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 text-left
					shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.99]"
				onclick={() => goto(`/app/chat/${agent.id}`)}
			>
				<div class="flex w-full items-start gap-3">
					<AgentAvatar avatarUrl={agent.avatarUrl} name={agent.name} size="lg" />
					<div class="min-w-0 flex-1">
						<p
							class="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary"
						>
							{agent.name}
						</p>
						{#if agent.description}
							<p class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
								{agent.description}
							</p>
						{:else}
							<p class="mt-0.5 text-xs text-muted-foreground/50 italic">No description</p>
						{/if}
					</div>
				</div>

				<div class="flex w-full items-center justify-between text-xs text-muted-foreground">
					<span class="flex items-center gap-1.5">
						<MessageSquareIcon class="size-3" />
						Start chatting
					</span>
					<span class="text-primary opacity-0 transition-opacity group-hover:opacity-100"> → </span>
				</div>
			</button>
		{/each}
	</div>
{/if}

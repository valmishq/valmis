<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import AgentCard from '$lib/components/custom/chat/AgentCard.svelte';
	import type { Agent } from '@repo/types';
	import BotIcon from '@lucide/svelte/icons/bot';
	import PlusIcon from '@lucide/svelte/icons/plus';

	/** All of the user's agents. Each card opens chat with that agent. */
	let { agents }: { agents: Agent[] } = $props();
</script>

<Card.Root>
	<Card.Header class="pb-3">
		<Card.Title class="text-sm font-medium">Your agents</Card.Title>
		<Card.Description class="text-xs">
			{agents.length === 0
				? 'No agents yet'
				: `${agents.length} agent${agents.length !== 1 ? 's' : ''} · pick one to start chatting`}
		</Card.Description>
		{#if agents.length > 0}
			<Card.Action>
				<Button variant="outline" size="sm" onclick={() => goto('/app/agents/new')} class="gap-2">
					<PlusIcon class="size-4" />
					New agent
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>

	{#if agents.length === 0}
		<Card.Content>
			<div class="flex flex-col items-center gap-3 py-10">
				<div
					class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
				>
					<BotIcon class="size-5" />
				</div>
				<div class="text-center">
					<p class="text-sm font-medium text-foreground">No agents yet</p>
					<p class="mt-0.5 text-xs text-muted-foreground">
						Create your first agent to start chatting and building workflows.
					</p>
				</div>
				<Button variant="outline" size="sm" onclick={() => goto('/app/agents/new')} class="gap-2">
					<PlusIcon class="size-4" />
					Create your first agent
				</Button>
			</div>
		</Card.Content>
	{:else}
		<Card.Content>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each agents as agent (agent.id)}
					<AgentCard {agent} />
				{/each}
			</div>
		</Card.Content>
	{/if}
</Card.Root>

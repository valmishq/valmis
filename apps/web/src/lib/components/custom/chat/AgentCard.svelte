<script lang="ts">
	import { goto } from '$app/navigation';
	import AgentAvatar from './AgentAvatar.svelte';
	import type { Agent } from '@repo/types';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';

	/**
	 * A clickable agent card that opens chat with the agent. Shared by the chat
	 * agent picker (/app/chat) and the home dashboard so they stay identical.
	 */
	let { agent }: { agent: Agent } = $props();
</script>

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

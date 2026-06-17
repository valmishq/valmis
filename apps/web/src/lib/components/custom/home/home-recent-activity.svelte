<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { formatRelativeTime } from '$lib/format.js';
	import type { ActivityItem } from '@repo/types';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import ZapIcon from '@lucide/svelte/icons/zap';

	/** Merged recent chats + workflow runs (server-sorted newest first). */
	let { activity }: { activity: ActivityItem[] } = $props();

	type StatusVariant = 'default' | 'secondary' | 'outline' | 'destructive';
	function statusVariant(status: string): StatusVariant {
		if (status === 'error') return 'destructive';
		if (status === 'running') return 'default';
		if (status === 'completed') return 'secondary';
		return 'outline';
	}

	function itemHref(item: ActivityItem): string {
		return item.kind === 'chat'
			? `/app/chat/${item.agentId}/${item.id}`
			: `/app/agents/${item.agentId}/workflows/${item.workflowId}/runs/${item.id}`;
	}
</script>

<Card.Root>
	<Card.Header class="pb-3">
		<Card.Title class="text-sm font-medium">Recent activity</Card.Title>
		<Card.Description class="text-xs">Latest chats and workflow runs.</Card.Description>
	</Card.Header>

	{#if activity.length === 0}
		<Card.Content>
			<div class="flex flex-col items-center gap-3 py-10">
				<div
					class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
				>
					<ActivityIcon class="size-5" />
				</div>
				<div class="text-center">
					<p class="text-sm font-medium text-foreground">No activity yet</p>
					<p class="mt-0.5 text-xs text-muted-foreground">
						Start a chat or run a workflow and it'll show up here.
					</p>
				</div>
			</div>
		</Card.Content>
	{:else}
		<Card.Content class="p-0">
			<ul class="divide-y divide-border">
				{#each activity as item (item.kind + item.id)}
					<li>
						<a
							href={itemHref(item)}
							class="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/50"
						>
							<div
								class="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
							>
								{#if item.kind === 'chat'}
									<MessageSquareIcon class="size-4" />
								{:else}
									<ZapIcon class="size-4" />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<p class="truncate text-sm font-medium text-foreground">
										{#if item.kind === 'chat'}
											{item.title || 'Untitled conversation'}
										{:else}
											{item.workflowName}
										{/if}
									</p>
									<Badge variant={statusVariant(item.status)} class="shrink-0 text-[10px]">
										{item.status}
									</Badge>
								</div>
								<p class="mt-0.5 truncate text-xs text-muted-foreground">
									{item.kind === 'chat' ? 'Chat' : 'Workflow run'} · {item.agentName}
								</p>
							</div>
							<span class="shrink-0 text-xs text-muted-foreground">
								{formatRelativeTime(item.timestamp)}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</Card.Content>
	{/if}
</Card.Root>

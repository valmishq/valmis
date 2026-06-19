<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { formatRelativeTime } from '$lib/format.js';
	import type { Workflow, Agent, CronTriggerConfig } from '@repo/types';
	import WorkflowIcon from '@lucide/svelte/icons/workflow';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import WebhookIcon from '@lucide/svelte/icons/webhook';
	import PlayIcon from '@lucide/svelte/icons/play';
	import BlocksIcon from '@lucide/svelte/icons/blocks';
	import BotIcon from '@lucide/svelte/icons/bot';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	/** Workflows are pre-sorted by the API (updatedAt desc); we surface the top 3. */
	let { workflows, agents }: { workflows: Workflow[]; agents: Agent[] } = $props();

	const topWorkflows = $derived(workflows.slice(0, 3));
	const agentNameById = $derived(new Map(agents.map((a) => [a.id, a.name])));

	/** Short human-readable label for the workflow's trigger (mirrors the workflows page). */
	function triggerLabel(w: Workflow): string {
		const t = w.trigger;
		if (!t) return 'No trigger';
		if (t.kind === 'cron') {
			const cfg = t.config as CronTriggerConfig;
			return cfg.schedule ? `Cron: ${cfg.schedule}` : 'Cron';
		}
		if (t.kind === 'webhook') return 'Webhook';
		if (t.kind === 'app') {
			const cfg = t.config as { provider?: string };
			return cfg.provider ? `App: ${cfg.provider}` : 'App event';
		}
		return 'Manual';
	}

	type TriggerVariant = 'outline' | 'secondary' | 'default';
	function triggerVariant(w: Workflow): TriggerVariant {
		const kind = w.trigger?.kind;
		if (kind === 'webhook') return 'secondary';
		if (kind === 'app') return 'default';
		return 'outline';
	}
</script>

<Card.Root>
	<Card.Header class="pb-3">
		<Card.Title class="text-sm font-medium">Workflows</Card.Title>
		<Card.Description class="text-xs">Your most recently updated automations.</Card.Description>
		{#if workflows.length > 0}
			<Card.Action>
				<Button variant="ghost" size="sm" onclick={() => goto('/app/workflows')}>View all</Button>
			</Card.Action>
		{/if}
	</Card.Header>

	{#if topWorkflows.length === 0}
		<Card.Content>
			<div class="flex flex-col items-center gap-3 py-10">
				<div
					class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
				>
					<WorkflowIcon class="size-5" />
				</div>
				<div class="text-center">
					<p class="text-sm font-medium text-foreground">No workflows yet</p>
					<p class="mt-0.5 text-xs text-muted-foreground">
						{#if agents.length === 0}
							Create an agent first, then build workflows to automate multi-step tasks.
						{:else}
							Build a workflow to automate multi-step tasks with your agents.
						{/if}
					</p>
				</div>
				{#if agents.length === 0}
					<Button variant="outline" size="sm" onclick={() => goto('/app/agents/new')} class="gap-2">
						<PlusIcon class="size-4" />
						Create an agent
					</Button>
				{:else}
					<Button variant="outline" size="sm" onclick={() => goto('/app/workflows')} class="gap-2">
						<PlusIcon class="size-4" />
						Create a workflow
					</Button>
				{/if}
			</div>
		</Card.Content>
	{:else}
		<Card.Content class="p-0">
			<ul class="divide-y divide-border">
				{#each topWorkflows as w (w.id)}
					<li>
						<a
							href="/app/agents/{w.agentId}/workflows/{w.id}/runs"
							class="group flex items-start justify-between gap-4 px-6 py-4 transition-colors hover:bg-muted/50"
						>
							<div class="flex min-w-0 flex-1 items-start gap-3">
								<div
									class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"
								>
									<WorkflowIcon class="size-4 text-muted-foreground" />
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-2">
										<p class="truncate text-sm font-medium text-foreground">{w.name}</p>
										<Badge variant="secondary" class="shrink-0 gap-1 text-xs">
											<BotIcon class="size-3" />
											{agentNameById.get(w.agentId) ?? 'Unknown agent'}
										</Badge>
										<Badge variant={triggerVariant(w)} class="shrink-0 gap-1 text-xs">
											{#if w.trigger?.kind === 'cron'}
												<ClockIcon class="size-3" />
											{:else if w.trigger?.kind === 'webhook'}
												<WebhookIcon class="size-3" />
											{:else if w.trigger?.kind === 'app'}
												<BlocksIcon class="size-3" />
											{:else}
												<PlayIcon class="size-3" />
											{/if}
											{triggerLabel(w)}
										</Badge>
										{#if !w.isEnabled}
											<Badge variant="secondary" class="shrink-0 text-xs">Disabled</Badge>
										{/if}
									</div>
									{#if w.description}
										<p class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{w.description}</p>
									{/if}
									<p class="mt-0.5 text-xs text-muted-foreground">
										Updated {formatRelativeTime(w.updatedAt)}
									</p>
								</div>
							</div>
							<ChevronRightIcon
								class="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
							/>
						</a>
					</li>
				{/each}
			</ul>
		</Card.Content>
	{/if}
</Card.Root>

<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import type { PageData } from './$types';
	import type { WorkflowRun, WorkflowRunStatus } from '@repo/types';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ZapIcon from '@lucide/svelte/icons/zap';
	import ClockIcon from '@lucide/svelte/icons/clock';

	let { data }: { data: PageData } = $props();

	// ── Helpers ────────────────────────────────────────────────────────────────

	function statusVariant(
		status: WorkflowRunStatus
	): 'default' | 'secondary' | 'destructive' | 'outline' {
		switch (status) {
			case 'running':
				return 'default';
			case 'completed':
				return 'secondary';
			case 'error':
				return 'destructive';
			default:
				return 'outline';
		}
	}

	function triggerLabel(type: WorkflowRun['triggerType']): string {
		switch (type) {
			case 'cron':
				return 'Cron';
			case 'webhook':
				return 'Webhook';
			case 'manual':
				return 'Manual';
		}
	}

	function fmtRelative(date: Date | string): string {
		const d = new Date(date);
		const diff = Date.now() - d.getTime();
		const mins = Math.floor(diff / 60_000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function fmtDuration(run: WorkflowRun): string {
		if (!run.completedAt) return '—';
		const ms = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
		if (ms < 1000) return '<1s';
		const secs = Math.floor(ms / 1000);
		if (secs < 60) return `${secs}s`;
		const mins = Math.floor(secs / 60);
		return `${mins}m ${secs % 60}s`;
	}
</script>

<svelte:head>
	<title>{data.workflow.name} — Runs — AgentInt</title>
	<meta
		name="description"
		content="View execution history for the workflow {data.workflow.name}."
	/>
</svelte:head>

<!-- ── Page header ───────────────────────────────────────────────────────── -->
<PageHeader title="Runs" description="Execution history for {data.workflow.name}.">
	{#snippet actions()}
		<Button
			variant="outline"
			size="sm"
			onclick={() => goto(`/app/workflows?agentId=${data.agent.id}`)}
			class="gap-2"
		>
			<ArrowLeftIcon class="size-4" />
			Back to workflow
		</Button>
	{/snippet}
</PageHeader>

<!-- ── Runs table ─────────────────────────────────────────────────────────── -->
<Card.Root>
	<Card.Header class="pb-3">
		<Card.Title class="text-sm font-medium">Run history</Card.Title>
		<Card.Description class="text-xs">Click a row to view step details.</Card.Description>
	</Card.Header>

	{#if data.runs.length === 0}
		<Card.Content>
			<div class="flex flex-col items-center gap-3 py-10">
				<div
					class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
				>
					<ZapIcon class="size-5" />
				</div>
				<div class="text-center">
					<p class="text-sm font-medium text-foreground">No runs yet</p>
					<p class="mt-0.5 text-xs text-muted-foreground">
						This workflow hasn't been triggered yet.
					</p>
				</div>
			</div>
		</Card.Content>
	{:else}
		<Card.Content class="p-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Run ID</Table.Head>
						<Table.Head>Trigger</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head class="text-right">Started</Table.Head>
						<Table.Head class="text-right">Duration</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.runs as run (run.id)}
						<Table.Row
							class="cursor-pointer"
							onclick={() =>
								goto(`/app/agents/${data.agent.id}/workflows/${data.workflow.id}/runs/${run.id}`)}
						>
							<!-- Run ID (truncated) -->
							<Table.Cell class="font-mono text-xs text-muted-foreground">
								{run.id.slice(0, 8)}…
							</Table.Cell>

							<!-- Trigger type -->
							<Table.Cell>
								<Badge variant="outline" class="text-xs">{triggerLabel(run.triggerType)}</Badge>
							</Table.Cell>

							<!-- Status -->
							<Table.Cell>
								<Badge variant={statusVariant(run.status)} class="text-xs capitalize">
									{run.status}
								</Badge>
							</Table.Cell>

							<!-- Started at -->
							<Table.Cell class="text-right text-muted-foreground">
								<span class="inline-flex items-center gap-1 text-xs">
									<ClockIcon class="size-3" />
									{fmtRelative(run.startedAt)}
								</span>
							</Table.Cell>

							<!-- Duration -->
							<Table.Cell class="text-right text-xs text-muted-foreground tabular-nums">
								{fmtDuration(run)}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	{/if}
</Card.Root>

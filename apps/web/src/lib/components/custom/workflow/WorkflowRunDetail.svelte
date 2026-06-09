<script lang="ts">
	import { browser } from '$app/environment';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import WorkflowStepLog from '$lib/components/custom/workflow/WorkflowStepLog.svelte';
	import { api } from '$lib/api.client.js';
	import type { WorkflowRun, WorkflowRunStatus, WorkflowStepLog as StepLog } from '@repo/types';
	import { fly } from 'svelte/transition';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	interface Props {
		/** Initial run data from SSR */
		initialRun: WorkflowRun;
		/** Initial step logs from SSR */
		initialStepLogs: StepLog[];
		agentId: string;
		workflowId: string;
	}

	let { initialRun, initialStepLogs, agentId, workflowId }: Props = $props();

	// ── Live state — seeded from SSR, updated by the polling loop ───────────────
	let run = $state<WorkflowRun>(initialRun);
	let stepLogs = $state<StepLog[]>(initialStepLogs);

	/**
	 * Current timestamp updated every second while the run is active.
	 * Passed to WorkflowStepLog so per-step elapsed times also tick in real time.
	 */
	let now = $state(Date.now());

	/** How often to re-fetch while the run is active (ms) */
	const POLL_INTERVAL_MS = 3000;

	// ── Tick every second while active — drives live duration displays ──────────
	$effect(() => {
		if (!browser || run.status !== 'running') return;

		const clock = setInterval(() => {
			now = Date.now();
		}, 1000);

		return () => clearInterval(clock);
	});

	// ── Auto-refresh effect — active only while run.status === 'running' ────────
	$effect(() => {
		if (!browser || run.status !== 'running') return;

		const runId = run.id;

		async function fetchLatest(): Promise<void> {
			const [runsRes, stepsRes] = await Promise.all([
				// No single-run endpoint exists — fetch the list and find by id
				api(`/agents/${agentId}/workflows/${workflowId}/runs?limit=100&offset=0`),
				api(`/agents/${agentId}/workflows/${workflowId}/runs/${runId}/steps`)
			]);

			if (runsRes.ok) {
				const body = (await runsRes.json()) as { data?: { runs?: WorkflowRun[] } };
				const found = body.data?.runs?.find((r) => r.id === runId);
				if (found) run = found;
			}

			if (stepsRes.ok) {
				const body = (await stepsRes.json()) as { data?: StepLog[] };
				const logs = body.data ?? [];
				logs.sort((a, b) => a.stepIndex - b.stepIndex);
				stepLogs = logs;
			}
		}

		const timer = setInterval(() => {
			fetchLatest().catch(() => {
				// Swallow transient fetch errors; the interval will retry on the next tick
			});
		}, POLL_INTERVAL_MS);

		return () => clearInterval(timer);
	});

	// ── Display helpers ────────────────────────────────────────────────────────

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

	function fmtDate(date: Date | string): string {
		return new Date(date).toLocaleString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	/**
	 * Formats elapsed duration for the overall run.
	 * When the run is still active, uses the live `now` ticker so the display
	 * increments every second without a backend call.
	 */
	function fmtDuration(): string {
		const endMs = run.completedAt ? new Date(run.completedAt).getTime() : now;
		if (!run.completedAt && run.status !== 'running') return '—';
		const ms = endMs - new Date(run.startedAt).getTime();
		return fmtMs(ms);
	}

	/** Formats a millisecond count into a human-readable string */
	function fmtMs(ms: number): string {
		if (ms < 1000) return '<1s';
		const secs = Math.floor(ms / 1000);
		if (secs < 60) return `${secs}s`;
		const mins = Math.floor(secs / 60);
		return `${mins}m ${secs % 60}s`;
	}

	function triggerLabel(type: string): string {
		const map: Record<string, string> = { cron: 'Cron', webhook: 'Webhook', manual: 'Manual' };
		return map[type] ?? type;
	}

	let showPayload = $state(false);
	const prettyPayload = $derived(
		run.triggerPayload ? JSON.stringify(run.triggerPayload, null, 2) : null
	);
</script>

<!-- ── Run header card ────────────────────────────────────────────────────── -->
<Card.Root>
	<Card.Content class="pt-5">
		<dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
			<div>
				<dt class="text-xs text-muted-foreground">Status</dt>
				<dd class="mt-1 flex items-center gap-1.5">
					<Badge variant={statusVariant(run.status)} class="text-xs capitalize">
						{run.status}
					</Badge>
					{#if run.status === 'running'}
						<RefreshCwIcon class="size-3 animate-spin text-muted-foreground" />
					{/if}
				</dd>
			</div>
			<div>
				<dt class="text-xs text-muted-foreground">Trigger</dt>
				<dd class="mt-1">
					<Badge variant="outline" class="text-xs">{triggerLabel(run.triggerType)}</Badge>
				</dd>
			</div>
			<div>
				<dt class="text-xs text-muted-foreground">Started</dt>
				<dd class="mt-1 font-medium text-foreground">{fmtDate(run.startedAt)}</dd>
			</div>
			<div>
				<dt class="text-xs text-muted-foreground">Duration</dt>
				<!--
					`now` is a reactive dependency here — when it ticks every second
					Svelte re-evaluates fmtDuration() and updates this text node.
				-->
				<dd class="mt-1 font-medium text-foreground tabular-nums">{fmtDuration()}</dd>
			</div>
		</dl>

		<!-- Top-level run error -->
		{#if run.error}
			<div
				class="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
			>
				{run.error}
			</div>
		{/if}

		<!-- Trigger payload collapsible -->
		{#if prettyPayload}
			<div class="mt-4">
				<button
					type="button"
					onclick={() => (showPayload = !showPayload)}
					class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					<ChevronRightIcon
						class="size-3.5 transition-transform duration-150 {showPayload ? 'rotate-90' : ''}"
					/>
					Trigger payload
				</button>
				<div
					class="grid transition-all duration-200 ease-in-out {showPayload
						? 'grid-rows-[1fr]'
						: 'grid-rows-[0fr]'}"
				>
					<div class="overflow-hidden">
						<pre
							class="mt-2 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">{prettyPayload}</pre>
					</div>
				</div>
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<!-- ── Step timeline ─────────────────────────────────────────────────────── -->
<Card.Root>
	<Card.Header class="pb-2">
		<Card.Title class="text-sm font-medium">Step timeline</Card.Title>
		<Card.Description class="text-xs">
			{stepLogs.length} step{stepLogs.length !== 1 ? 's' : ''} executed
			{#if run.status === 'running'}
				<span class="ml-1 text-muted-foreground">· auto-refreshing…</span>
			{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content class="pt-4">
		{#if stepLogs.length === 0}
			<p class="py-6 text-center text-sm text-muted-foreground">
				{#if run.status === 'running'}
					Waiting for steps to start…
				{:else}
					No step logs yet.
				{/if}
			</p>
		{:else}
			<!-- Hide the connector line on the last step -->
			<div class="[&>*:last-child_.step-connector]:hidden">
				{#each stepLogs as log (log.id)}
					<!--
						fly transition: new steps slide in from below with a short fade.
						Pass `now` down so each running step can also show a live
						elapsed time without its own separate interval.
					-->
					<div in:fly={{ y: 12, duration: 250, opacity: 0 }}>
						<WorkflowStepLog {log} {now} />
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>

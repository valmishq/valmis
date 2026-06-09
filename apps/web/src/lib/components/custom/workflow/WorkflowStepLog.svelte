<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { WorkflowStepLog, WorkflowStepLogStatus } from '@repo/types';
	import { fade, scale } from 'svelte/transition';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Check } from '@lucide/svelte';
	import { X } from '@lucide/svelte';
	import SkipForwardIcon from '@lucide/svelte/icons/skip-forward';
	import LoaderIcon from '@lucide/svelte/icons/loader';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';

	interface Props {
		log: WorkflowStepLog;
		/**
		 * Current timestamp in ms, ticked by the parent every second while the run
		 * is active. When present, running steps show a live elapsed time.
		 * Defaults to Date.now() so the component works standalone too.
		 */
		now?: number;
	}

	let { log, now = Date.now() }: Props = $props();

	let showInput = $state(false);
	let showOutput = $state(false);

	function statusVariant(
		status: WorkflowStepLogStatus
	): 'default' | 'secondary' | 'destructive' | 'outline' {
		switch (status) {
			case 'running':
				return 'default';
			case 'success':
				return 'secondary';
			case 'failed':
				return 'destructive';
			case 'skipped':
				return 'outline';
		}
	}

	/**
	 * Returns a formatted duration string for this step.
	 * For completed/failed/skipped steps, uses the stored completedAt timestamp.
	 * For a running step, uses the live `now` ticker so the display increments
	 * every second without any extra network requests.
	 */
	const stepDuration = $derived.by(() => {
		const startMs = new Date(log.startedAt).getTime();
		const endMs = log.completedAt ? new Date(log.completedAt).getTime() : now;

		if (!log.completedAt && log.status !== 'running') return '—';

		const ms = endMs - startMs;
		if (ms < 1000) return '<1s';
		const secs = Math.floor(ms / 1000);
		if (secs < 60) return `${secs}s`;
		const mins = Math.floor(secs / 60);
		return `${mins}m ${secs % 60}s`;
	});

	const prettyInput = $derived(log.inputContext ? JSON.stringify(log.inputContext, null, 2) : null);
	const prettyOutput = $derived(log.outputData ? JSON.stringify(log.outputData, null, 2) : null);
</script>

<!-- WorkflowStepLog: single step log row in run detail timeline -->
<div class="relative flex gap-4">
	<!-- Status icon in left column -->
	<div class="flex flex-col items-center">
		<!--
			{#key log.status} forces a re-mount + transition whenever the status
			changes (e.g. running → success/failed).
		-->
		{#key log.status}
			<div
				in:scale={{ start: 0.6, duration: 200 }}
				class="flex size-6 shrink-0 items-center justify-center rounded-full border-2 bg-background {log.status ===
				'success'
					? 'border-green-500 text-green-500'
					: log.status === 'failed'
						? 'border-destructive text-destructive'
						: log.status === 'skipped'
							? 'border-muted-foreground text-muted-foreground'
							: 'border-primary text-primary'}"
			>
				{#if log.status === 'success'}
					<Check class="size-4" />
				{:else if log.status === 'failed'}
					<X class="size-4" />
				{:else if log.status === 'skipped'}
					<SkipForwardIcon class="size-4" />
				{:else}
					<LoaderIcon class="size-4 animate-spin" />
				{/if}
			</div>
		{/key}
		<!-- Connector line (hidden for last item via parent) -->
		<div class="step-connector mt-1 w-px flex-1 bg-border"></div>
	</div>

	<!-- Step content -->
	<div class="min-w-0 flex-1 pb-6">
		<!-- Header -->
		<div class="flex flex-wrap items-center gap-2">
			<p class="text-sm font-medium text-foreground">{log.stepName}</p>
			<!--
				{#key log.status} on the badge fades it in whenever status changes.
			-->
			{#key log.status}
				<span in:fade={{ duration: 200 }}>
					<Badge variant={statusVariant(log.status)} class="text-xs capitalize">{log.status}</Badge>
				</span>
			{/key}
			{#if log.attemptNumber > 1}
				<Badge variant="outline" class="text-xs">Attempt {log.attemptNumber}</Badge>
			{/if}
			<!-- stepDuration is reactive to `now`, so it ticks live for running steps -->
			<span class="ml-auto text-xs text-muted-foreground tabular-nums">{stepDuration}</span>
		</div>

		<!-- Error message -->
		{#if log.error}
			<div
				class="mt-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
			>
				<AlertTriangleIcon class="mt-0.5 size-3.5 shrink-0 text-destructive" />
				<p class="text-xs text-destructive">{log.error}</p>
			</div>
		{/if}

		<!-- Collapsible input / output -->
		<div class="mt-2 space-y-1.5">
			<!-- Input -->
			{#if prettyInput}
				<button
					type="button"
					onclick={() => (showInput = !showInput)}
					class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					<ChevronRightIcon
						class="size-3.5 transition-transform duration-150 {showInput ? 'rotate-90' : ''}"
					/>
					Input context
				</button>
				<div
					class="grid transition-all duration-200 ease-in-out {showInput
						? 'grid-rows-[1fr]'
						: 'grid-rows-[0fr]'}"
				>
					<div class="overflow-hidden">
						<pre
							class="mt-1 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">{prettyInput}</pre>
					</div>
				</div>
			{/if}

			<!-- Output -->
			{#if prettyOutput}
				<button
					type="button"
					onclick={() => (showOutput = !showOutput)}
					class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					<ChevronRightIcon
						class="size-3.5 transition-transform duration-150 {showOutput ? 'rotate-90' : ''}"
					/>
					Output data
				</button>
				<div
					class="grid transition-all duration-200 ease-in-out {showOutput
						? 'grid-rows-[1fr]'
						: 'grid-rows-[0fr]'}"
				>
					<div class="overflow-hidden">
						<pre
							class="mt-1 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">{prettyOutput}</pre>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

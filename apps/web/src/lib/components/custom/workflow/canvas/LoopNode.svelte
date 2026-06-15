<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import type { LoopNodeRender } from '$lib/workflow/graph';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	/** Loop node. Inputs: 'in' (entry) and 'loopBack' (body returns here). Outputs:
	 *  'loop' (body) and 'done' (continue). The body runs once per item / while true. */
	let { data, selected }: NodeProps = $props();

	const loop = $derived((data as LoopNodeRender).loop);
	const whileMode = $derived(
		loop.evalMode ??
			(loop.prompt ? 'smart' : loop.condition?.conditions.length ? 'manual' : 'smart')
	);
</script>

<Handle type="target" position={Position.Left} id="in" />
<Handle type="target" position={Position.Top} id="loopBack" />

<div
	class="relative w-52 rounded-lg border bg-card shadow-sm transition-colors {selected
		? 'border-primary ring-1 ring-primary'
		: 'border-violet-500/50 hover:border-violet-500/70'}"
>
	<div class="flex items-center gap-2 border-b border-border px-3 py-2">
		<div
			class="flex size-6 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400"
		>
			<RefreshCwIcon class="size-3.5" />
		</div>
		<span class="truncate text-sm font-medium text-foreground">{loop.name || 'Loop'}</span>
	</div>
	<div class="px-3 py-2 text-xs text-muted-foreground">
		{#if loop.mode === 'forEach'}
			For each item · max {loop.maxIterations}
		{:else}
			While · {whileMode === 'smart' ? 'Smart' : 'Manual'} · max {loop.maxIterations}
		{/if}
	</div>

	<span class="absolute top-[42%] right-1.5 text-[9px] font-medium text-muted-foreground">done</span
	>
	<span
		class="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] font-medium text-violet-600 dark:text-violet-400"
	>
		body ↻
	</span>
</div>

<Handle type="source" position={Position.Bottom} id="loop" />
<Handle type="source" position={Position.Right} id="done" style="top: 50%" />

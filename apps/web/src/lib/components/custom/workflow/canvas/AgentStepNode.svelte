<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { AgentNodeRender } from '$lib/workflow/graph';
	import BotIcon from '@lucide/svelte/icons/bot';
	import WrenchIcon from '@lucide/svelte/icons/wrench';
	import KeyIcon from '@lucide/svelte/icons/key';
	import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';

	/** Custom Svelte Flow node for an agent step. Data carries the WorkflowStep. */
	let { data, selected }: NodeProps = $props();

	const step = $derived((data as AgentNodeRender).step);
	const toolCount = $derived(step.allowedTools.length);
	const credCount = $derived(step.allowedCredentialIds.length);
	const errorAction = $derived(step.errorHandling.action);
</script>

<!-- Target (input) handle on the left, source (output) handle on the right -->
<Handle type="target" position={Position.Left} id="in" />

<div
	class="w-60 rounded-lg border bg-card shadow-sm transition-colors {selected
		? 'border-primary ring-1 ring-primary'
		: 'border-border hover:border-primary/50'}"
>
	<div class="flex items-center gap-2 border-b border-border px-3 py-2">
		<div
			class="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
		>
			<BotIcon class="size-3.5" />
		</div>
		<span class="truncate text-sm font-medium text-foreground">
			{step.name || 'Untitled step'}
		</span>
	</div>

	<div class="space-y-2 px-3 py-2">
		{#if step.instruction.trim()}
			<p class="line-clamp-2 text-xs text-muted-foreground">{step.instruction}</p>
		{:else}
			<p class="text-xs text-muted-foreground/70 italic">No instruction yet</p>
		{/if}

		<div class="flex flex-wrap items-center gap-1.5">
			<Badge variant="outline" class="gap-1 text-[10px] font-normal">
				<WrenchIcon class="size-3" />
				{toolCount === 0 ? 'all tools' : `${toolCount} tool${toolCount !== 1 ? 's' : ''}`}
			</Badge>
			{#if credCount > 0}
				<Badge variant="outline" class="gap-1 text-[10px] font-normal">
					<KeyIcon class="size-3" />
					{credCount}
				</Badge>
			{/if}
			{#if errorAction !== 'stop'}
				<Badge variant="secondary" class="gap-1 text-[10px] font-normal">
					<ShieldAlertIcon class="size-3" />
					{errorAction}
				</Badge>
			{/if}
		</div>
	</div>
</div>

<Handle type="source" position={Position.Right} id="out" />

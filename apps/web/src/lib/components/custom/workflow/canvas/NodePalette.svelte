<script lang="ts">
	import type { WorkflowNodeType } from '@repo/types';
	import { DRAG_MIME } from '$lib/workflow/graph';
	import BotIcon from '@lucide/svelte/icons/bot';
	import GitBranchIcon from '@lucide/svelte/icons/git-branch';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	/** Drag source for adding nodes to the canvas. Each item can be dragged onto the
	 *  canvas (handled by WorkflowCanvas's drop) or clicked to add at a default spot. */

	interface PaletteItem {
		type: WorkflowNodeType;
		label: string;
		/** A lucide icon component (all share BotIcon's component type). */
		icon: typeof BotIcon;
		description: string;
	}

	interface Props {
		onAdd: (type: WorkflowNodeType) => void;
	}

	let { onAdd }: Props = $props();

	/** Node types available to drop onto the canvas. */
	const items: PaletteItem[] = [
		{ type: 'agent', label: 'Agent Step', icon: BotIcon, description: 'A full agent turn' },
		{ type: 'condition', label: 'Condition', icon: GitBranchIcon, description: 'Branch on a rule' },
		{ type: 'loop', label: 'Loop', icon: RefreshCwIcon, description: 'Repeat over items' }
	];

	function onDragStart(event: DragEvent, type: WorkflowNodeType) {
		if (!event.dataTransfer) return;
		event.dataTransfer.setData(DRAG_MIME, type);
		event.dataTransfer.effectAllowed = 'move';
	}
</script>

<div class="w-44 rounded-lg border border-border bg-card/95 p-2 shadow-md backdrop-blur">
	<p class="px-1 pb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
		Add node
	</p>
	<div class="space-y-1">
		{#each items as item (item.type)}
			<button
				type="button"
				draggable="true"
				ondragstart={(e) => onDragStart(e, item.type)}
				onclick={() => onAdd(item.type)}
				class="flex w-full cursor-grab items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left transition-colors hover:border-primary/50 hover:bg-muted/50 active:cursor-grabbing"
				title="Drag onto the canvas or click to add"
			>
				<div
					class="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
				>
					<item.icon class="size-3.5" />
				</div>
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-foreground">{item.label}</p>
					<p class="truncate text-[10px] text-muted-foreground">{item.description}</p>
				</div>
			</button>
		{/each}
	</div>
</div>

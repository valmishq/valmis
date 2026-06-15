<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import WorkflowStepConfigForm from './WorkflowStepConfigForm.svelte';
	import type { WorkflowStep, CredentialMetadata, CredentialDefinition } from '@repo/types';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import TrashIcon from '@lucide/svelte/icons/trash-2';

	/**
	 * Collapsible card for a single workflow step. Header (number, collapse,
	 * reorder, delete) lives here; the editable fields are delegated to the shared
	 * WorkflowStepConfigForm so the card and the visual builder's Sheet stay in sync.
	 */
	interface Props {
		step: WorkflowStep;
		index: number;
		total: number;
		credentials: CredentialMetadata[];
		definitions: CredentialDefinition[];
		onMoveUp: () => void;
		onMoveDown: () => void;
		onDelete: () => void;
		onChange: (updated: WorkflowStep) => void;
	}

	let {
		step,
		index,
		total,
		credentials,
		definitions,
		onMoveUp,
		onMoveDown,
		onDelete,
		onChange
	}: Props = $props();

	let expanded = $state(true);
	const toolCount = $derived(step.allowedTools.length);
</script>

<Card.Root class="border-border bg-card transition-shadow duration-200">
	<!-- ── Header row ─────────────────────────────────────────────────────────── -->
	<div class="flex items-center gap-3 px-4 py-3">
		<div
			class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
		>
			{index + 1}
		</div>

		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			class="flex min-w-0 flex-1 items-center gap-2 text-left"
			aria-expanded={expanded}
		>
			<span class="truncate text-sm font-medium text-foreground">
				{step.name || 'Untitled step'}
			</span>
			<ChevronRightIcon
				class="size-4 shrink-0 text-muted-foreground transition-transform duration-200 {expanded
					? 'rotate-90'
					: ''}"
			/>
		</button>

		{#if !expanded && toolCount > 0}
			<Badge variant="outline" class="shrink-0 text-xs">
				{toolCount} tool{toolCount !== 1 ? 's' : ''}
			</Badge>
		{/if}

		<div class="flex shrink-0 items-center gap-1">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onclick={onMoveUp}
				disabled={index === 0}
				class="size-7 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
				title="Move step up"
			>
				<ChevronUpIcon class="size-4" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onclick={onMoveDown}
				disabled={index === total - 1}
				class="size-7 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
				title="Move step down"
			>
				<ChevronDownIcon class="size-4" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onclick={onDelete}
				class="size-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
				title="Remove step"
			>
				<TrashIcon class="size-4" />
			</Button>
		</div>
	</div>

	<!-- ── Collapsible body — CSS grid-rows trick for smooth animation ────────── -->
	<div
		class="grid transition-all duration-300 ease-in-out {expanded
			? 'grid-rows-[1fr]'
			: 'grid-rows-[0fr]'}"
	>
		<div class="overflow-hidden">
			<div class="border-t border-border px-4 pt-4 pb-4">
				<WorkflowStepConfigForm {step} {credentials} {definitions} {onChange} />
			</div>
		</div>
	</div>
</Card.Root>

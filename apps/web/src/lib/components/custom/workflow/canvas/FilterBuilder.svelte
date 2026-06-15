<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { FilterValue, FilterCondition, FilterOperator } from '@repo/types';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TrashIcon from '@lucide/svelte/icons/trash-2';

	/** Builds an n8n-style FilterValue (and/or over left/operator/right rows). Used by
	 *  condition nodes and loop while-conditions. Emits on every change. */
	interface Props {
		filter: FilterValue;
		onChange: (filter: FilterValue) => void;
	}

	let { filter, onChange }: Props = $props();

	const OPERATORS: { value: FilterOperator; label: string; unary?: boolean }[] = [
		{ value: 'equals', label: 'equals' },
		{ value: 'notEquals', label: 'not equals' },
		{ value: 'contains', label: 'contains' },
		{ value: 'notContains', label: 'does not contain' },
		{ value: 'gt', label: '> (greater than)' },
		{ value: 'gte', label: '≥ (greater or equal)' },
		{ value: 'lt', label: '< (less than)' },
		{ value: 'lte', label: '≤ (less or equal)' },
		{ value: 'isEmpty', label: 'is empty', unary: true },
		{ value: 'isNotEmpty', label: 'is not empty', unary: true },
		{ value: 'isTrue', label: 'is true', unary: true },
		{ value: 'isFalse', label: 'is false', unary: true },
		{ value: 'exists', label: 'exists', unary: true },
		{ value: 'notExists', label: 'does not exist', unary: true }
	];

	const VAR_HINT = '{{steps.<nodeId>.output.field}}';

	let combinator = $state<'and' | 'or'>(filter.combinator ?? 'and');
	let conditions = $state<FilterCondition[]>(
		filter.conditions.length
			? filter.conditions.map((c) => ({ ...c }))
			: [{ left: '', operator: 'equals', right: '' }]
	);

	function emit() {
		onChange({ combinator, conditions: conditions.map((c) => ({ ...c })) });
	}

	function isUnary(op: FilterOperator): boolean {
		return OPERATORS.find((o) => o.value === op)?.unary ?? false;
	}

	function opLabel(op: FilterOperator): string {
		return OPERATORS.find((o) => o.value === op)?.label ?? op;
	}

	function addRow() {
		conditions = [...conditions, { left: '', operator: 'equals', right: '' }];
		emit();
	}

	function removeRow(index: number) {
		conditions = conditions.filter((_, i) => i !== index);
		if (conditions.length === 0) conditions = [{ left: '', operator: 'equals', right: '' }];
		emit();
	}

	function updateRow(index: number, patch: Partial<FilterCondition>) {
		conditions = conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
		emit();
	}
</script>

<div class="space-y-3">
	{#if conditions.length > 1}
		<div class="flex items-center gap-2">
			<Label class="text-xs text-muted-foreground">Match</Label>
			<Select.Root
				type="single"
				value={combinator}
				onValueChange={(v) => {
					if (v === 'and' || v === 'or') {
						combinator = v;
						emit();
					}
				}}
			>
				<Select.Trigger class="h-8 w-24">{combinator === 'and' ? 'ALL' : 'ANY'}</Select.Trigger>
				<Select.Content>
					<Select.Item value="and">ALL (and)</Select.Item>
					<Select.Item value="or">ANY (or)</Select.Item>
				</Select.Content>
			</Select.Root>
			<span class="text-xs text-muted-foreground">of the following</span>
		</div>
	{/if}

	<div class="space-y-2">
		{#each conditions as condition, i (i)}
			<div class="space-y-1.5 rounded-md border border-border p-2">
				<div class="flex items-start gap-1.5">
					<Input
						type="text"
						value={condition.left}
						oninput={(e) => updateRow(i, { left: e.currentTarget.value })}
						placeholder={VAR_HINT}
						class="h-8 flex-1 font-mono text-xs"
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={() => removeRow(i)}
						class="size-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
						title="Remove condition"
					>
						<TrashIcon class="size-4" />
					</Button>
				</div>
				<div class="flex items-center gap-1.5">
					<Select.Root
						type="single"
						value={condition.operator}
						onValueChange={(v) => v && updateRow(i, { operator: v as FilterOperator })}
					>
						<Select.Trigger class="h-8 w-44">{opLabel(condition.operator)}</Select.Trigger>
						<Select.Content>
							{#each OPERATORS as op (op.value)}
								<Select.Item value={op.value}>{op.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					{#if !isUnary(condition.operator)}
						<Input
							type="text"
							value={condition.right ?? ''}
							oninput={(e) => updateRow(i, { right: e.currentTarget.value })}
							placeholder="value"
							class="h-8 flex-1 text-xs"
						/>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<Button type="button" variant="outline" size="sm" onclick={addRow} class="gap-1.5">
		<PlusIcon class="size-3.5" />
		Add condition
	</Button>
</div>

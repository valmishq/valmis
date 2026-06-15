<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import FilterBuilder from './FilterBuilder.svelte';
	import type { WorkflowConditionNodeData, WorkflowEvalMode, FilterValue } from '@repo/types';

	/** Config form for a condition node. 'Smart' = the agent judges a natural-language
	 *  predicate; 'Manual' = a deterministic FilterValue. The two outputs ('true' /
	 *  'false') route the flow based on the result. */
	interface Props {
		condition: WorkflowConditionNodeData;
		onChange: (data: WorkflowConditionNodeData) => void;
	}

	let { condition, onChange }: Props = $props();

	// Stored as a const so the Svelte parser doesn't treat {{ }} as an expression.
	const PROMPT_HINT =
		"Describe the condition in plain language. The agent reads the previous steps' output and decides true/false. Reference data with {{steps.<id>.output.field}} if you need to.";

	let name = $state(condition.name);
	let evalMode = $state<WorkflowEvalMode>(condition.evalMode ?? 'smart');
	let prompt = $state(condition.prompt ?? '');
	let filter = $state<FilterValue>(condition.filter ?? { combinator: 'and', conditions: [] });

	function emit() {
		onChange({ name, evalMode, prompt, filter });
	}
</script>

<div class="space-y-4">
	<div class="space-y-1.5">
		<Label for="condition-name">Name</Label>
		<Input
			id="condition-name"
			type="text"
			bind:value={name}
			oninput={emit}
			placeholder="e.g. Is high priority?"
		/>
	</div>

	<div class="space-y-1.5">
		<Label>Decision mode</Label>
		<Select.Root
			type="single"
			value={evalMode}
			onValueChange={(v) => {
				if (v === 'smart' || v === 'manual') {
					evalMode = v;
					emit();
				}
			}}
		>
			<Select.Trigger class="w-full">
				{evalMode === 'smart' ? 'Smart — the agent decides' : 'Manual — field rules'}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="smart">Smart — the agent decides</Select.Item>
				<Select.Item value="manual">Manual — field rules</Select.Item>
			</Select.Content>
		</Select.Root>
	</div>

	{#if evalMode === 'smart'}
		<div class="space-y-1.5">
			<Label for="condition-prompt">Condition</Label>
			<textarea
				id="condition-prompt"
				bind:value={prompt}
				oninput={emit}
				placeholder="e.g. the share price is above 1000"
				rows={3}
				class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
			></textarea>
			<p class="text-xs text-muted-foreground">{PROMPT_HINT}</p>
		</div>
	{:else}
		<div class="space-y-1.5">
			<Label>Rules</Label>
			<FilterBuilder
				{filter}
				onChange={(f) => {
					filter = f;
					emit();
				}}
			/>
		</div>
	{/if}

	<p class="text-xs text-muted-foreground">
		When this is true, the flow follows the <span class="font-medium">true</span> output; otherwise
		the <span class="font-medium">false</span> output.
	</p>
</div>

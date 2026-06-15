<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import FilterBuilder from './FilterBuilder.svelte';
	import type { WorkflowLoopNodeData, WorkflowEvalMode, FilterValue } from '@repo/types';

	/** Config form for a loop node. forEach iterates over an array template; while
	 *  repeats until a condition is false. The while-condition is evaluated either by
	 *  the agent (Smart) or by deterministic rules (Manual). The body runs from the
	 *  'loop' output and must connect back to the loop's loop-back input. */
	interface Props {
		loop: WorkflowLoopNodeData;
		onChange: (data: WorkflowLoopNodeData) => void;
	}

	let { loop, onChange }: Props = $props();

	// Stored as consts so the Svelte parser doesn't treat {{ }} as expressions.
	const VAR_ITEM = '{{loop.item}}';
	const VAR_INDEX = '{{loop.index}}';
	const ITEMS_HINT = '{{steps.<nodeId>.output.items}}';
	const WHILE_PROMPT_HINT =
		"Describe when the loop should keep going. Each iteration the agent reads the latest body output and decides, e.g. 'the list still has fewer than 3 items'.";

	let name = $state(loop.name);
	let mode = $state<'forEach' | 'while'>(loop.mode);
	let items = $state(loop.items ?? '');
	let evalMode = $state<WorkflowEvalMode>(loop.evalMode ?? 'smart');
	let prompt = $state(loop.prompt ?? '');
	let conditionFilter = $state<FilterValue>(
		loop.condition ?? { combinator: 'and', conditions: [] }
	);
	let maxIterations = $state(loop.maxIterations ?? 10);

	function emit() {
		onChange({
			name,
			mode,
			items: mode === 'forEach' ? items : undefined,
			evalMode,
			prompt,
			condition: conditionFilter,
			maxIterations
		});
	}
</script>

<div class="space-y-4">
	<div class="space-y-1.5">
		<Label for="loop-name">Name</Label>
		<Input
			id="loop-name"
			type="text"
			bind:value={name}
			oninput={emit}
			placeholder="e.g. For each item"
		/>
	</div>

	<div class="space-y-1.5">
		<Label>Loop type</Label>
		<Select.Root
			type="single"
			value={mode}
			onValueChange={(v) => {
				if (v === 'forEach' || v === 'while') {
					mode = v;
					emit();
				}
			}}
		>
			<Select.Trigger class="w-full">
				{mode === 'forEach' ? 'For each item' : 'While condition'}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="forEach">For each item</Select.Item>
				<Select.Item value="while">While condition</Select.Item>
			</Select.Content>
		</Select.Root>
	</div>

	{#if mode === 'forEach'}
		<div class="space-y-1.5">
			<Label for="loop-items">Items</Label>
			<textarea
				id="loop-items"
				bind:value={items}
				oninput={emit}
				placeholder={ITEMS_HINT}
				rows={2}
				class="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
			></textarea>
			<p class="text-xs text-muted-foreground">
				A template resolving to a JSON array. Inside the body, use
				<code class="rounded bg-muted px-1 py-0.5">{VAR_ITEM}</code> and
				<code class="rounded bg-muted px-1 py-0.5">{VAR_INDEX}</code>.
			</p>
		</div>
	{:else}
		<div class="space-y-1.5">
			<Label>Continue while</Label>
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
				<Label for="loop-prompt">Keep going while…</Label>
				<textarea
					id="loop-prompt"
					bind:value={prompt}
					oninput={emit}
					placeholder="e.g. the list still has fewer than 3 items"
					rows={3}
					class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				></textarea>
				<p class="text-xs text-muted-foreground">{WHILE_PROMPT_HINT}</p>
			</div>
		{:else}
			<div class="space-y-1.5">
				<Label>Rules</Label>
				<FilterBuilder
					filter={conditionFilter}
					onChange={(f) => {
						conditionFilter = f;
						emit();
					}}
				/>
			</div>
		{/if}
	{/if}

	<div class="space-y-1.5">
		<Label for="loop-max">Max iterations</Label>
		<Input
			id="loop-max"
			type="number"
			min={1}
			max={1000}
			bind:value={maxIterations}
			oninput={emit}
			class="w-28"
		/>
		<p class="text-xs text-muted-foreground">Safety cap to prevent runaway loops (1–1000).</p>
	</div>
</div>

<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { WorkflowStep, CredentialMetadata, CredentialDefinition } from '@repo/types';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	/** All available tool names in the agent runtime */
	const AVAILABLE_TOOLS = [
		{ name: 'call_api', label: 'Call API' },
		{ name: 'read_file', label: 'Read File' },
		{ name: 'write_file', label: 'Write File' },
		{ name: 'list_files', label: 'List Files' },
		{ name: 'run_terminal', label: 'Run Terminal' },
		{ name: 'run_code', label: 'Run Code' },
		{ name: 'ask_human', label: 'Ask Human' },
		{ name: 'memory_search', label: 'Memory Search' },
		{ name: 'memory_write', label: 'Memory Write' }
	] as const;

	// Variable hints shown in placeholder text — stored as const to avoid
	// Svelte template parser treating {{ as a Svelte expression.
	const VAR_TRIGGER = '{{trigger.payload}}';
	const VAR_STEP = '{{steps.0.output}}';
	const SCHEMA_PLACEHOLDER =
		'{\n  "type": "object",\n  "properties": {\n    "result": { "type": "string" }\n  }\n}';

	interface Props {
		step: WorkflowStep;
		index: number;
		total: number;
		credentials: CredentialMetadata[];
		/** Credential definitions used to resolve integration icons */
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

	function getDefinition(type: string): CredentialDefinition | undefined {
		return definitions.find((d) => d.id === type);
	}

	// ── Collapsed/expanded state ──────────────────────────────────────────────
	let expanded = $state(true);

	// ── Local editable copies ─────────────────────────────────────────────────
	let name = $state(step.name);
	let instruction = $state(step.instruction);
	let inputMapping = $state(step.inputMapping ?? '');
	let maxToolCallsPerStep = $state(step.maxToolCallsPerStep ?? 20);
	let expectedResponseSchema = $state(
		step.expectedResponseSchema ? JSON.stringify(step.expectedResponseSchema, null, 2) : ''
	);
	let schemaError = $state('');
	let errorAction = $state<'stop' | 'continue' | 'retry'>(step.errorHandling.action);
	let maxRetries = $state(step.errorHandling.maxRetries ?? 3);
	let fallbackAction = $state<'stop' | 'continue'>(step.errorHandling.fallbackAction ?? 'stop');

	let selectedTools = $state<Set<string>>(new Set(step.allowedTools));
	let selectedCredentialIds = $state<Set<string>>(new Set(step.allowedCredentialIds));

	/** Emit updated step to parent */
	function emit() {
		let parsedSchema: Record<string, unknown> | undefined;
		schemaError = '';
		if (expectedResponseSchema.trim()) {
			try {
				parsedSchema = JSON.parse(expectedResponseSchema) as Record<string, unknown>;
			} catch {
				schemaError = 'Invalid JSON — schema will not be saved until fixed.';
				parsedSchema = undefined;
			}
		}

		onChange({
			...step,
			name,
			instruction,
			inputMapping: inputMapping.trim() || undefined,
			allowedTools: [...selectedTools],
			allowedCredentialIds: [...selectedCredentialIds],
			maxToolCallsPerStep,
			expectedResponseSchema: parsedSchema,
			errorHandling: {
				action: errorAction,
				...(errorAction === 'retry' ? { maxRetries, fallbackAction } : {})
			}
		});
	}

	function toggleTool(toolName: string) {
		const next = new Set(selectedTools);
		if (next.has(toolName)) next.delete(toolName);
		else next.add(toolName);
		selectedTools = next;
		emit();
	}

	function toggleCredential(id: string) {
		const next = new Set(selectedCredentialIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedCredentialIds = next;
		emit();
	}

	const errorActionLabel = $derived(
		errorAction === 'stop' ? 'Stop workflow' : errorAction === 'continue' ? 'Continue' : 'Retry'
	);

	const fallbackActionLabel = $derived(
		fallbackAction === 'stop' ? 'Stop workflow' : 'Continue to next step'
	);
</script>

<!-- WorkflowStepCard: collapsible card for a single workflow step -->
<Card.Root class="border-border bg-card transition-shadow duration-200">
	<!-- ── Header row ─────────────────────────────────────────────────────────── -->
	<div class="flex items-center gap-3 px-4 py-3">
		<!-- Step number -->
		<div
			class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
		>
			{index + 1}
		</div>

		<!-- Title / collapse toggle -->
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			class="flex min-w-0 flex-1 items-center gap-2 text-left"
			aria-expanded={expanded}
		>
			<span class="truncate text-sm font-medium text-foreground">
				{name || 'Untitled step'}
			</span>
			<ChevronRightIcon
				class="size-4 shrink-0 text-muted-foreground transition-transform duration-200 {expanded
					? 'rotate-90'
					: ''}"
			/>
		</button>

		<!-- Tool count badge when collapsed -->
		{#if !expanded && selectedTools.size > 0}
			<Badge variant="outline" class="shrink-0 text-xs">
				{selectedTools.size} tool{selectedTools.size !== 1 ? 's' : ''}
			</Badge>
		{/if}

		<!-- Reorder + delete -->
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
			<div class="space-y-4 border-t border-border px-4 pt-4 pb-4">
				<!-- Step name -->
				<div class="space-y-1.5">
					<Label for="step-name-{step.id}">Step name</Label>
					<Input
						id="step-name-{step.id}"
						type="text"
						bind:value={name}
						oninput={emit}
						placeholder="e.g. Fetch weather data"
						required
					/>
				</div>

				<!-- Instruction -->
				<div class="space-y-1.5">
					<Label for="step-instruction-{step.id}">Instruction</Label>
					<textarea
						id="step-instruction-{step.id}"
						bind:value={instruction}
						oninput={emit}
						placeholder="Describe what the agent should do in this step…"
						rows={4}
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					></textarea>
				</div>

				<!-- Input mapping -->
				<div class="space-y-1.5">
					<Label for="step-input-{step.id}">
						Input mapping
						<span class="ml-1 font-normal text-muted-foreground">(optional)</span>
					</Label>
					<textarea
						id="step-input-{step.id}"
						bind:value={inputMapping}
						oninput={emit}
						placeholder="e.g. The trigger data is: {VAR_TRIGGER}"
						rows={2}
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					></textarea>
					<p class="text-xs text-muted-foreground">
						Available variables: <code class="rounded bg-muted px-1 py-0.5 text-xs"
							>{VAR_TRIGGER}</code
						>,
						<code class="rounded bg-muted px-1 py-0.5 text-xs">{VAR_STEP}</code>. Leave empty to
						auto-inject previous step's output.
					</p>
				</div>

				<!-- Allowed tools -->
				<div class="space-y-2">
					<Label>
						Allowed tools
						<span class="ml-1 font-normal text-muted-foreground">
							({selectedTools.size === 0 ? 'all allowed' : selectedTools.size + ' selected'})
						</span>
					</Label>
					<div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
						{#each AVAILABLE_TOOLS as tool (tool.name)}
							{@const isSelected = selectedTools.has(tool.name)}
							<label
								class="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors {isSelected
									? 'border-primary bg-primary/5 text-foreground'
									: 'border-border text-muted-foreground hover:bg-muted/50'}"
							>
								<input
									type="checkbox"
									checked={isSelected}
									onchange={() => toggleTool(tool.name)}
									class="size-3 rounded border-border accent-primary"
								/>
								{tool.label}
							</label>
						{/each}
					</div>
					<p class="text-xs text-muted-foreground">
						Leave all unchecked to allow all tools. Check specific tools to restrict this step.
					</p>
				</div>

				<!-- Allowed credentials -->
				{#if credentials.length > 0}
					<div class="space-y-2">
						<Label>
							Allowed credentials
							<span class="ml-1 font-normal text-muted-foreground">
								({selectedCredentialIds.size === 0
									? 'all allowed'
									: selectedCredentialIds.size + ' selected'})
							</span>
						</Label>
						<div class="space-y-1.5">
							{#each credentials as cred (cred.id)}
								{@const isSelected = selectedCredentialIds.has(cred.id)}
								{@const def = getDefinition(cred.type)}
								<label
									class="flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-xs transition-colors {isSelected
										? 'border-primary bg-primary/5'
										: 'border-border hover:bg-muted/50'}"
								>
									<input
										type="checkbox"
										checked={isSelected}
										onchange={() => toggleCredential(cred.id)}
										class="size-3 rounded border-border accent-primary"
									/>
									<div
										class="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground"
									>
										{#if def?.icon}
											<img src={def.icon} alt={cred.type} class="size-3.5 object-contain" />
										{:else}
											<ShieldIcon class="size-3" />
										{/if}
									</div>
									<span class="truncate font-medium text-foreground">{cred.name}</span>
									<span class="ml-auto shrink-0 text-muted-foreground">{cred.type}</span>
								</label>
							{/each}
						</div>
						<p class="text-xs text-muted-foreground">
							Leave all unchecked to allow all agent credentials for this step.
						</p>
					</div>
				{/if}

				<!-- Max tool calls -->
				<div class="space-y-1.5">
					<Label for="step-max-tools-{step.id}">Max tool calls per step</Label>
					<Input
						id="step-max-tools-{step.id}"
						type="number"
						min={1}
						max={100}
						bind:value={maxToolCallsPerStep}
						oninput={emit}
						class="w-28"
					/>
					<p class="text-xs text-muted-foreground">
						Maximum tool calls the agent may make in this step (1–100). Default: 20.
					</p>
				</div>

				<!-- Expected response schema -->
				<div class="space-y-1.5">
					<Label for="step-schema-{step.id}">
						Expected response schema
						<span class="ml-1 font-normal text-muted-foreground">(optional JSON Schema)</span>
					</Label>
					<textarea
						id="step-schema-{step.id}"
						bind:value={expectedResponseSchema}
						oninput={emit}
						placeholder={SCHEMA_PLACEHOLDER}
						rows={4}
						spellcheck="false"
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm transition-colors placeholder:font-sans placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none {schemaError
							? 'border-destructive focus-visible:ring-destructive'
							: ''}"
					></textarea>
					{#if schemaError}
						<p class="text-xs text-destructive">{schemaError}</p>
					{:else}
						<p class="text-xs text-muted-foreground">
							When set, the agent must respond with valid JSON matching this schema.
						</p>
					{/if}
				</div>

				<!-- Error handling -->
				<div class="space-y-2">
					<Label>Error handling</Label>
					<Select.Root
						type="single"
						value={errorAction}
						onValueChange={(v) => {
							errorAction = v as 'stop' | 'continue' | 'retry';
							emit();
						}}
					>
						<Select.Trigger class="w-52">{errorActionLabel}</Select.Trigger>
						<Select.Content>
							<Select.Item value="stop" label="Stop workflow">Stop workflow</Select.Item>
							<Select.Item value="continue" label="Continue">Continue to next step</Select.Item>
							<Select.Item value="retry" label="Retry">Retry</Select.Item>
						</Select.Content>
					</Select.Root>

					{#if errorAction === 'retry'}
						<div class="ml-3 space-y-3 border-l-2 border-border pl-4">
							<div class="space-y-1.5">
								<Label for="step-retries-{step.id}">Max retries</Label>
								<Input
									id="step-retries-{step.id}"
									type="number"
									min={1}
									max={10}
									bind:value={maxRetries}
									oninput={emit}
									class="w-24"
								/>
							</div>
							<div class="space-y-1.5">
								<Label>After retries exhausted</Label>
								<Select.Root
									type="single"
									value={fallbackAction}
									onValueChange={(v) => {
										fallbackAction = v as 'stop' | 'continue';
										emit();
									}}
								>
									<Select.Trigger class="w-52">{fallbackActionLabel}</Select.Trigger>
									<Select.Content>
										<Select.Item value="stop" label="Stop workflow">Stop workflow</Select.Item>
										<Select.Item value="continue" label="Continue"
											>Continue to next step</Select.Item
										>
									</Select.Content>
								</Select.Root>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</Card.Root>

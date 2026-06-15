<script lang="ts">
	import { browser } from '$app/environment';
	import { SvelteFlowProvider, type Node, type Edge } from '@xyflow/svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { themeStore } from '$lib/stores/theme.store.js';
	import WorkflowCanvas from './WorkflowCanvas.svelte';
	import WorkflowNodeConfigSheet from './WorkflowNodeConfigSheet.svelte';
	import {
		initialDomainGraph,
		domainToFlow,
		flowToDomain,
		type AgentNodeRender,
		type ConditionNodeRender,
		type LoopNodeRender
	} from '$lib/workflow/graph.js';
	import type {
		Agent,
		Workflow,
		WorkflowStep,
		WorkflowAgentNode,
		WorkflowConditionNodeData,
		WorkflowLoopNodeData,
		AgentTriggerKind,
		CredentialMetadata,
		CredentialDefinition,
		AppTriggerProviderInfo,
		AppTriggerRegistrationStatus
	} from '@repo/types';

	/**
	 * Visual workflow builder: a Svelte Flow canvas (trigger + agent step nodes) plus
	 * a side-drawer node editor. Owns the graph + trigger state and exposes the
	 * serialized save payload and client-side validation errors to the page.
	 */
	interface Props {
		agent: Agent;
		workflow: Workflow | null;
		credentials: CredentialMetadata[];
		allCredentials: CredentialMetadata[];
		definitions: CredentialDefinition[];
		appTriggerProviders: AppTriggerProviderInfo[];
		/** Serialized workflow JSON for the page's hidden form input. */
		payload: string;
		/** Client-side validation problems, surfaced by the page on submit. */
		validationErrors: string[];
	}

	let {
		agent,
		workflow,
		credentials,
		allCredentials,
		definitions,
		appTriggerProviders,
		payload = $bindable(''),
		validationErrors = $bindable([])
	}: Props = $props();

	// ── Identity ────────────────────────────────────────────────────────────────
	let workflowName = $state(workflow?.name ?? '');
	let workflowDescription = $state(workflow?.description ?? '');

	// ── Trigger state (the trigger is a separate entity; node is UI only) ─────────
	let triggerKind = $state<AgentTriggerKind>(
		(workflow?.trigger?.kind as AgentTriggerKind | undefined) ?? 'manual'
	);
	let cronSchedule = $state<string>(
		workflow?.trigger?.kind === 'cron'
			? ((workflow.trigger.config as { schedule?: string } | undefined)?.schedule ?? '0 9 * * *')
			: '0 9 * * *'
	);
	let cronTimezone = $state<string>(
		workflow?.trigger?.kind === 'cron'
			? ((workflow.trigger.config as { timezone?: string } | undefined)?.timezone ?? 'UTC')
			: 'UTC'
	);
	let webhookRequireSignature = $state<boolean>(
		workflow?.trigger?.kind === 'webhook'
			? ((workflow.trigger.config as { requireSignature?: boolean } | undefined)
					?.requireSignature ?? true)
			: true
	);
	const appConfig = $derived(
		workflow?.trigger?.kind === 'app'
			? (workflow.trigger.config as {
					provider?: string;
					event?: string;
					credentialId?: string;
					params?: Record<string, unknown>;
					pollIntervalSec?: number;
				})
			: undefined
	);
	let appProvider = $state<string>(
		(workflow?.trigger?.kind === 'app'
			? (workflow.trigger.config as { provider?: string }).provider
			: undefined) ??
			appTriggerProviders[0]?.id ??
			''
	);
	let appEvent = $state<string>(
		(workflow?.trigger?.kind === 'app'
			? (workflow.trigger.config as { event?: string }).event
			: undefined) ??
			appTriggerProviders[0]?.events[0]?.id ??
			''
	);
	let appCredentialId = $state<string>(
		workflow?.trigger?.kind === 'app'
			? ((workflow.trigger.config as { credentialId?: string }).credentialId ?? '')
			: ''
	);
	let appParams = $state<Record<string, unknown>>(
		workflow?.trigger?.kind === 'app'
			? ((workflow.trigger.config as { params?: Record<string, unknown> }).params ?? {})
			: {}
	);
	let appPollIntervalSec = $state<number | undefined>(
		workflow?.trigger?.kind === 'app'
			? (workflow.trigger.config as { pollIntervalSec?: number }).pollIntervalSec
			: undefined
	);

	const webhookSecret = $derived(
		triggerKind === 'webhook' && workflow?.trigger?.kind === 'webhook'
			? ((workflow.trigger.config as { secret?: string } | undefined)?.secret ?? null)
			: null
	);
	const webhookUrl = $derived(
		workflow?.trigger
			? `${browser ? window.location.origin : ''}/api/v1/webhooks/${workflow.trigger.id}`
			: null
	);
	const appRegistration = $derived<AppTriggerRegistrationStatus | undefined>(
		workflow?.trigger?.kind === 'app' ? workflow.trigger.appRegistration : undefined
	);

	// ── Graph state (Svelte Flow render model) ────────────────────────────────────
	const seed = initialDomainGraph(workflow);
	const seedFlow = domainToFlow(seed.nodes, seed.edges, triggerKind);
	let nodes = $state.raw<Node[]>(seedFlow.nodes);
	let edges = $state.raw<Edge[]>(seedFlow.edges);

	// Keep the trigger node's badge in sync with the selected trigger kind.
	$effect(() => {
		const kind = triggerKind;
		const trig = nodes.find((n) => n.type === 'trigger');
		if (trig && (trig.data as { kind?: string }).kind !== kind) {
			nodes = nodes.map((n) => (n.type === 'trigger' ? { ...n, data: { ...n.data, kind } } : n));
		}
	});

	// ── Selection / Sheet ─────────────────────────────────────────────────────────
	let selectedNodeId = $state<string | null>(null);
	const selectedNode = $derived(nodes.find((n) => n.id === selectedNodeId) ?? null);
	const selectedNodeType = $derived(
		(selectedNode?.type as 'trigger' | 'agent' | 'condition' | 'loop' | undefined) ?? null
	);
	const selectedStep = $derived(
		selectedNode?.type === 'agent' ? (selectedNode.data as AgentNodeRender).step : null
	);
	const selectedCondition = $derived(
		selectedNode?.type === 'condition' ? (selectedNode.data as ConditionNodeRender).condition : null
	);
	const selectedLoop = $derived(
		selectedNode?.type === 'loop' ? (selectedNode.data as LoopNodeRender).loop : null
	);

	function onSelect(nodeId: string | null) {
		selectedNodeId = nodeId;
	}

	// Commit handlers — called by the config Sheet only when the user clicks Save.
	function onSaveStep(updated: WorkflowStep) {
		nodes = nodes.map((n) =>
			n.type === 'agent' && n.id === updated.id ? { ...n, data: { step: updated } } : n
		);
	}

	function onSaveCondition(updated: WorkflowConditionNodeData) {
		if (!selectedNodeId) return;
		nodes = nodes.map((n) =>
			n.type === 'condition' && n.id === selectedNodeId ? { ...n, data: { condition: updated } } : n
		);
	}

	function onSaveLoop(updated: WorkflowLoopNodeData) {
		if (!selectedNodeId) return;
		nodes = nodes.map((n) =>
			n.type === 'loop' && n.id === selectedNodeId ? { ...n, data: { loop: updated } } : n
		);
	}

	function onSaveTrigger(t: {
		kind: AgentTriggerKind;
		cronSchedule: string;
		cronTimezone: string;
		webhookRequireSignature: boolean;
		appProvider: string;
		appEvent: string;
		appCredentialId: string;
		appParams: Record<string, unknown>;
		appPollIntervalSec: number | undefined;
	}) {
		triggerKind = t.kind;
		cronSchedule = t.cronSchedule;
		cronTimezone = t.cronTimezone;
		webhookRequireSignature = t.webhookRequireSignature;
		appProvider = t.appProvider;
		appEvent = t.appEvent;
		appCredentialId = t.appCredentialId;
		appParams = t.appParams;
		appPollIntervalSec = t.appPollIntervalSec;
	}

	// ── Serialization → payload (graph is the source of truth) ────────────────────
	const domain = $derived(flowToDomain(nodes, edges));

	const triggerConfig = $derived(
		triggerKind === 'cron'
			? { schedule: cronSchedule.trim(), timezone: cronTimezone.trim() || 'UTC' }
			: triggerKind === 'webhook'
				? { requireSignature: webhookRequireSignature }
				: triggerKind === 'app'
					? {
							provider: appProvider,
							event: appEvent,
							credentialId: appCredentialId,
							params: appParams,
							pollIntervalSec: appPollIntervalSec
						}
					: {}
	);

	$effect(() => {
		payload = JSON.stringify({
			name: workflowName.trim(),
			description: workflowDescription.trim() || undefined,
			nodes: domain.nodes,
			edges: domain.edges,
			isEnabled: workflow?.isEnabled ?? true,
			trigger: {
				kind: triggerKind,
				name: workflowName.trim() || undefined,
				config: triggerConfig,
				description: undefined
			}
		});
	});

	// ── Client-side validation ────────────────────────────────────────────────────
	// Mirrors the server's per-node field rules (validator.ts: workflowStepSchema,
	// conditionNodeDataSchema, loopNodeDataSchema). The server remains authoritative
	// and additionally enforces graph-structure invariants (unique ids, one trigger,
	// edge integrity, acyclic-except-loopBack) that aren't re-checked here.
	const computedErrors = $derived.by(() => {
		const errs: string[] = [];
		if (!workflowName.trim()) errs.push('Workflow name is required');
		const agentNodes = domain.nodes.filter((n) => n.type === 'agent') as WorkflowAgentNode[];
		if (agentNodes.length === 0) errs.push('Workflow must have at least one step');
		agentNodes.forEach((n, i) => {
			if (!n.data.name.trim()) errs.push(`Step ${i + 1} → name is required`);
			if (!n.data.instruction.trim()) errs.push(`Step ${i + 1} → instruction is required`);
		});

		// Condition nodes: name required; Manual mode needs ≥1 rule, Smart mode needs a prompt.
		for (const n of domain.nodes) {
			if (n.type !== 'condition') continue;
			const d = n.data as WorkflowConditionNodeData;
			const label = d.name?.trim() || 'Condition';
			if (!d.name?.trim()) errs.push(`${label} → name is required`);
			const mode = d.evalMode ?? 'smart';
			if (mode === 'manual') {
				if (!d.filter || d.filter.conditions.length === 0)
					errs.push(`${label} → add at least one rule (or switch to Smart mode)`);
			} else if (!d.prompt || !d.prompt.trim()) {
				errs.push(`${label} → describe the condition for the agent to evaluate`);
			}
		}

		// Loop nodes: name required; a while-loop needs a continue-condition (rule or prompt).
		for (const n of domain.nodes) {
			if (n.type !== 'loop') continue;
			const d = n.data as WorkflowLoopNodeData;
			const label = d.name?.trim() || 'Loop';
			if (!d.name?.trim()) errs.push(`${label} → name is required`);
			if (d.mode === 'while') {
				const mode = d.evalMode ?? 'smart';
				if (mode === 'manual') {
					if (!d.condition || d.condition.conditions.length === 0)
						errs.push(`${label} → add at least one rule (or switch to Smart mode)`);
				} else if (!d.prompt || !d.prompt.trim()) {
					errs.push(`${label} → describe when the loop should continue`);
				}
			}
		}

		if (triggerKind === 'cron' && !cronSchedule.trim()) errs.push('Cron schedule is required');
		if (triggerKind === 'app') {
			if (!appProvider) errs.push('App trigger: choose an app');
			if (!appEvent) errs.push('App trigger: choose an event');
			if (!appCredentialId) errs.push('App trigger: choose a credential');
			const provider = appTriggerProviders.find((p) => p.id === appProvider);
			const ev = provider?.events.find((e) => e.id === appEvent);
			for (const field of ev?.params ?? []) {
				if (!field.required) continue;
				const value = appParams[field.name];
				const isEmpty =
					value === undefined ||
					value === null ||
					value === '' ||
					(Array.isArray(value) && value.length === 0);
				if (isEmpty) errs.push(`App trigger: "${field.label}" is required`);
			}
		}
		return errs;
	});

	$effect(() => {
		validationErrors = computedErrors;
	});
</script>

<div class="space-y-4">
	<!-- Identity -->
	<Card.Root>
		<Card.Content class="grid gap-4 pt-6 sm:grid-cols-2">
			<div class="space-y-1.5">
				<Label for="workflow-name">Name</Label>
				<Input
					id="workflow-name"
					type="text"
					bind:value={workflowName}
					required
					placeholder="e.g. Daily Report Generator"
				/>
			</div>
			<div class="space-y-1.5">
				<Label for="workflow-description">
					Description
					<span class="ml-1 font-normal text-muted-foreground">(optional)</span>
				</Label>
				<Input
					id="workflow-description"
					type="text"
					bind:value={workflowDescription}
					placeholder="What does this workflow do?"
				/>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Canvas -->
	<div
		class="h-[calc(100vh-20rem)] min-h-[460px] w-full overflow-hidden rounded-lg border border-border bg-muted/20"
	>
		{#if browser}
			<SvelteFlowProvider>
				<WorkflowCanvas bind:nodes bind:edges colorMode={$themeStore} {onSelect} />
			</SvelteFlowProvider>
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-sm text-muted-foreground">Loading canvas…</p>
			</div>
		{/if}
	</div>
	<p class="text-xs text-muted-foreground">
		Drag <span class="font-medium">Add node</span> onto the canvas (or click it) to add a step. Connect
		nodes by dragging from a node's right handle to the next node's left handle. Click any node to configure
		it. Select an edge or node and press Delete to remove it.
	</p>
</div>

<!-- Node editor drawer -->
<WorkflowNodeConfigSheet
	open={selectedNodeId !== null}
	nodeId={selectedNodeId}
	nodeType={selectedNodeType}
	onClose={() => onSelect(null)}
	step={selectedStep}
	{credentials}
	{definitions}
	{onSaveStep}
	condition={selectedCondition}
	loop={selectedLoop}
	{onSaveCondition}
	{onSaveLoop}
	{triggerKind}
	{cronSchedule}
	{cronTimezone}
	{webhookRequireSignature}
	{appProvider}
	{appEvent}
	{appCredentialId}
	{appParams}
	{appPollIntervalSec}
	{onSaveTrigger}
	providers={appTriggerProviders}
	{allCredentials}
	{webhookSecret}
	{webhookUrl}
	triggerId={workflow?.trigger?.id ?? null}
	{appRegistration}
/>

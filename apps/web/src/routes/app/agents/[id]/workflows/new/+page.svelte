<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import WorkflowStepCard from '$lib/components/custom/workflow/WorkflowStepCard.svelte';
	import CronSchedulePicker from '$lib/components/custom/workflow/CronSchedulePicker.svelte';
	import type { PageData, ActionData } from './$types';
	import type { WorkflowStep, CredentialDefinition, AgentTriggerKind } from '@repo/types';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ZapIcon from '@lucide/svelte/icons/zap';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import WebhookIcon from '@lucide/svelte/icons/webhook';
	import PlayIcon from '@lucide/svelte/icons/play';
	import CopyIcon from '@lucide/svelte/icons/copy';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const isEditMode = $derived(data.isEditMode);
	const agent = $derived(data.agent);
	const workflow = $derived(data.workflow);

	// ── Form state ────────────────────────────────────────────────────────────
	let workflowName = $state(workflow?.name ?? '');
	let workflowDescription = $state(workflow?.description ?? '');
	let steps = $state<WorkflowStep[]>(
		workflow?.steps && workflow.steps.length > 0 ? workflow.steps : [defaultStep()]
	);
	let isSaving = $state(false);

	// ── Trigger state ─────────────────────────────────────────────────────────
	/** Currently selected trigger kind */
	let triggerKind = $state<AgentTriggerKind>(
		(workflow?.trigger?.kind as AgentTriggerKind | undefined) ?? 'manual'
	);
	/** Cron schedule expression */
	let cronSchedule = $state<string>(
		triggerKind === 'cron'
			? ((workflow?.trigger?.config as { schedule?: string } | undefined)?.schedule ?? '0 9 * * *')
			: '0 9 * * *'
	);
	/** IANA timezone for cron */
	let cronTimezone = $state<string>(
		triggerKind === 'cron'
			? ((workflow?.trigger?.config as { timezone?: string } | undefined)?.timezone ?? 'UTC')
			: 'UTC'
	);
	/** Webhook secret — shown read-only in edit mode if already provisioned */
	const webhookSecret = $derived(
		triggerKind === 'webhook' && workflow?.trigger?.kind === 'webhook'
			? ((workflow.trigger.config as { secret?: string } | undefined)?.secret ?? null)
			: null
	);
	/** Webhook URL shown to the user */
	const webhookUrl = $derived(
		workflow?.trigger
			? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/webhooks/${workflow.trigger.id}`
			: null
	);

	let copiedSecret = $state(false);
	let copiedUrl = $state(false);

	function copyToClipboard(text: string, field: 'secret' | 'url') {
		navigator.clipboard.writeText(text).then(() => {
			if (field === 'secret') {
				copiedSecret = true;
				setTimeout(() => (copiedSecret = false), 2000);
			} else {
				copiedUrl = true;
				setTimeout(() => (copiedUrl = false), 2000);
			}
		});
	}

	/** Create a fresh default step */
	function defaultStep(): WorkflowStep {
		return {
			id: crypto.randomUUID(),
			name: '',
			instruction: '',
			allowedTools: [],
			allowedCredentialIds: [],
			errorHandling: { action: 'stop' }
		};
	}

	// Show saved alert after redirect
	$effect(() => {
		if ($page.url.searchParams.get('saved') === 'true') {
			setAlert({
				type: 'success',
				title: isEditMode ? 'Workflow updated' : 'Workflow created',
				message: isEditMode
					? `"${workflowName}" has been saved.`
					: 'Your new workflow has been created.',
				duration: 5000,
				show: true
			});
		}
	});

	// ── Step management ───────────────────────────────────────────────────────

	function addStep() {
		steps = [...steps, defaultStep()];
	}

	function removeStep(index: number) {
		if (steps.length <= 1) return; // keep at least one step
		steps = steps.filter((_, i) => i !== index);
	}

	function moveStep(fromIndex: number, toIndex: number) {
		if (toIndex < 0 || toIndex >= steps.length) return;
		const next = [...steps];
		const [moved] = next.splice(fromIndex, 1);
		next.splice(toIndex, 0, moved);
		steps = next;
	}

	function updateStep(index: number, updated: WorkflowStep) {
		steps = steps.map((s, i) => (i === index ? updated : s));
	}

	// ── Form submission ───────────────────────────────────────────────────────

	/**
	 * Serialises the full workflow (including trigger) into a JSON string for the hidden input.
	 * The form action parses this and sends it to the API.
	 */
	const workflowJson = $derived(
		JSON.stringify({
			name: workflowName.trim(),
			description: workflowDescription.trim() || undefined,
			steps,
			isEnabled: workflow?.isEnabled ?? true,
			trigger: {
				kind: triggerKind,
				name: workflowName.trim() || undefined,
				config:
					triggerKind === 'cron'
						? { schedule: cronSchedule.trim(), timezone: cronTimezone.trim() || 'UTC' }
						: {},
				description: undefined
			}
		})
	);
</script>

<svelte:head>
	{#if isEditMode && workflow}
		<title>{workflow.name} — Edit Workflow — AgentInt</title>
		<meta name="description" content="Edit the workflow configuration for {agent.name}." />
	{:else}
		<title>New Workflow — {agent.name} — AgentInt</title>
		<meta name="description" content="Create a new automated workflow for {agent.name}." />
	{/if}
</svelte:head>

<PageHeader
	title={isEditMode && workflow ? workflow.name : 'New Workflow'}
	description={isEditMode
		? 'Edit workflow steps, tools, and error handling.'
		: 'Build a multi-step automation pipeline for this agent.'}
>
	{#snippet actions()}
		<Button
			variant="outline"
			size="sm"
			onclick={() => goto(`/app/agents/${agent.id}/workflows`)}
			class="gap-2"
		>
			<ArrowLeftIcon class="size-4" />
			Back to workflows
		</Button>
	{/snippet}
</PageHeader>

<!-- Server-side form action handles create and edit -->
<form
	method="POST"
	action="?/save"
	use:enhance={() => {
		isSaving = true;
		return async ({ result, update }) => {
			isSaving = false;
			if (result.type === 'failure') {
				setAlert({
					type: 'error',
					title: isEditMode ? 'Failed to save workflow' : 'Failed to create workflow',
					message: (result.data as { error?: string })?.error ?? 'An unexpected error occurred.',
					duration: 5000,
					show: true
				});
			} else {
				await update();
			}
		};
	}}
	class="space-y-6"
>
	<!-- Hidden fields -->
	{#if isEditMode && workflow}
		<input type="hidden" name="workflowId" value={workflow.id} />
	{/if}
	<input type="hidden" name="workflowJson" value={workflowJson} />

	<!-- ── Workflow identity ──────────────────────────────────────────────────── -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">Workflow Details</Card.Title>
			<Card.Description class="text-xs">Name and describe this workflow.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
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

	<!-- ── Trigger ────────────────────────────────────────────────────────────── -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">Trigger</Card.Title>
			<Card.Description class="text-xs">
				How this workflow is started. A trigger is automatically created alongside the workflow.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<!-- Kind selector -->
			<div class="space-y-1.5">
				<Label for="trigger-kind">Trigger type</Label>
				<Select.Root
					type="single"
					value={triggerKind}
					onValueChange={(v) => {
						if (v === 'manual' || v === 'cron' || v === 'webhook') {
							triggerKind = v;
						}
					}}
				>
					<Select.Trigger id="trigger-kind" class="w-full">
						{#if triggerKind === 'manual'}
							<span class="flex items-center gap-2">
								<PlayIcon class="size-4 text-muted-foreground" />
								Manual
							</span>
						{:else if triggerKind === 'cron'}
							<span class="flex items-center gap-2">
								<ClockIcon class="size-4 text-muted-foreground" />
								Scheduled (Cron)
							</span>
						{:else}
							<span class="flex items-center gap-2">
								<WebhookIcon class="size-4 text-muted-foreground" />
								Webhook
							</span>
						{/if}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="manual">
							<span class="flex items-center gap-2">
								<PlayIcon class="size-4" />
								<span>
									<span class="font-medium">Manual</span>
									<span class="ml-1 text-xs text-muted-foreground">— fire on demand</span>
								</span>
							</span>
						</Select.Item>
						<Select.Item value="cron">
							<span class="flex items-center gap-2">
								<ClockIcon class="size-4" />
								<span>
									<span class="font-medium">Scheduled (Cron)</span>
									<span class="ml-1 text-xs text-muted-foreground">— run on a schedule</span>
								</span>
							</span>
						</Select.Item>
						<Select.Item value="webhook">
							<span class="flex items-center gap-2">
								<WebhookIcon class="size-4" />
								<span>
									<span class="font-medium">Webhook</span>
									<span class="ml-1 text-xs text-muted-foreground">— triggered by HTTP request</span
									>
								</span>
							</span>
						</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>

			{#if triggerKind === 'cron'}
				<!-- Cron fields -->
				<div class="space-y-4 rounded-lg border border-border p-4">
					<!-- Visual schedule picker — stays in sync with the raw expression below -->
					<CronSchedulePicker bind:value={cronSchedule} />

					<div class="space-y-1.5">
						<Label for="cron-schedule">
							Expression
							<a
								href="https://crontab.guru/"
								target="_blank"
								rel="noopener noreferrer"
								class="ml-1 text-xs font-normal text-muted-foreground underline-offset-2 hover:underline"
							>
								reference ↗
							</a>
						</Label>
						<Input
							id="cron-schedule"
							type="text"
							bind:value={cronSchedule}
							placeholder="0 9 * * 1-5"
							class="font-mono text-sm"
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="cron-timezone">
							Timezone
							<span class="ml-1 font-normal text-muted-foreground">(optional)</span>
						</Label>
						<Input
							id="cron-timezone"
							type="text"
							bind:value={cronTimezone}
							placeholder="UTC"
							class="font-mono text-sm"
						/>
						<p class="text-xs text-muted-foreground">
							IANA timezone name, e.g. <code class="rounded bg-muted px-1 py-0.5"
								>America/New_York</code
							>
						</p>
					</div>
				</div>
			{:else if triggerKind === 'webhook'}
				<!-- Webhook info -->
				<div class="space-y-3 rounded-lg border border-border p-4">
					<p class="text-xs text-muted-foreground">
						A webhook endpoint and HMAC secret are generated automatically when the workflow is
						created. Use the secret to sign requests with the
						<code class="rounded bg-muted px-1 py-0.5">X-Hub-Signature-256</code> header.
					</p>

					{#if webhookSecret && webhookUrl}
						<!-- Show existing webhook details in edit mode -->
						<div class="space-y-2">
							<div class="space-y-1.5">
								<Label class="text-xs">Webhook URL</Label>
								<div class="flex items-center gap-2">
									<Input type="text" value={webhookUrl} readonly class="font-mono text-xs" />
									<Button
										type="button"
										variant="outline"
										size="sm"
										onclick={() => copyToClipboard(webhookUrl!, 'url')}
										class="shrink-0"
									>
										<CopyIcon class="size-4" />
										<span class="sr-only">{copiedUrl ? 'Copied!' : 'Copy URL'}</span>
									</Button>
								</div>
							</div>
							<div class="space-y-1.5">
								<Label class="text-xs">HMAC Secret</Label>
								<div class="flex items-center gap-2">
									<Input type="text" value={webhookSecret} readonly class="font-mono text-xs" />
									<Button
										type="button"
										variant="outline"
										size="sm"
										onclick={() => copyToClipboard(webhookSecret!, 'secret')}
										class="shrink-0"
									>
										<CopyIcon class="size-4" />
										<span class="sr-only">{copiedSecret ? 'Copied!' : 'Copy secret'}</span>
									</Button>
								</div>
								<p class="text-xs text-muted-foreground">
									{copiedSecret
										? '✓ Copied to clipboard'
										: 'Keep this secret safe — it verifies incoming requests.'}
								</p>
							</div>
						</div>
					{:else}
						<p class="text-xs text-amber-600 dark:text-amber-400">
							Save the workflow to generate a webhook URL and secret.
						</p>
					{/if}
				</div>
			{:else}
				<!-- Manual trigger info -->
				<div class="rounded-lg border border-border p-4">
					<p class="text-xs text-muted-foreground">
						Manual triggers are fired on demand from the Workflows list page or via the
						<code class="rounded bg-muted px-1 py-0.5">trigger_workflow</code> agent tool.
					</p>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- ── Steps ─────────────────────────────────────────────────────────────── -->
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<div>
				<h2 class="text-sm font-medium text-foreground">Steps</h2>
				<p class="mt-0.5 text-xs text-muted-foreground">
					Steps run in order. Each step is an isolated agent turn.
				</p>
			</div>
			<Button type="button" variant="outline" size="sm" onclick={addStep} class="gap-2">
				<PlusIcon class="size-4" />
				Add step
			</Button>
		</div>

		{#if steps.length === 0}
			<!-- Empty state (shouldn't happen since we start with one step) -->
			<Card.Root>
				<Card.Content>
					<div class="flex flex-col items-center gap-3 py-8">
						<ZapIcon class="size-5 text-muted-foreground" />
						<p class="text-sm text-muted-foreground">No steps yet.</p>
						<Button type="button" variant="outline" size="sm" onclick={addStep} class="gap-2">
							<PlusIcon class="size-4" />
							Add first step
						</Button>
					</div>
				</Card.Content>
			</Card.Root>
		{:else}
			<!-- Steps list with smooth reordering via CSS transitions -->
			<div class="space-y-3">
				{#each steps as step, i (step.id)}
					<div class="transition-all duration-300 ease-in-out" style="transform-origin: top center">
						<WorkflowStepCard
							{step}
							index={i}
							total={steps.length}
							credentials={data.credentials}
							definitions={data.definitions}
							onMoveUp={() => moveStep(i, i - 1)}
							onMoveDown={() => moveStep(i, i + 1)}
							onDelete={() => removeStep(i)}
							onChange={(updated) => updateStep(i, updated)}
						/>
					</div>
				{/each}

				<!-- Add step button at end of list for easy access -->
				<Button type="button" variant="outline" size="sm" onclick={addStep} class="gap-2">
					<PlusIcon class="size-4" />
					Add step
				</Button>
			</div>
		{/if}
	</div>

	<!-- ── Submit ─────────────────────────────────────────────────────────────── -->
	<Separator />
	<div class="flex justify-end gap-3">
		<Button
			type="button"
			variant="outline"
			onclick={() => goto(`/app/agents/${agent.id}/workflows`)}
			disabled={isSaving}
		>
			Cancel
		</Button>
		<Button type="submit" disabled={isSaving || !workflowName.trim() || steps.length === 0}>
			{#if isSaving}
				{isEditMode ? 'Saving…' : 'Creating…'}
			{:else}
				{isEditMode ? 'Save changes' : 'Create workflow'}
			{/if}
		</Button>
	</div>
</form>

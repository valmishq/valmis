<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api.client.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import type { PageData } from './$types';
	import type { Workflow } from '@repo/types';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ListIcon from '@lucide/svelte/icons/list';
	import ZapIcon from '@lucide/svelte/icons/zap';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import WebhookIcon from '@lucide/svelte/icons/webhook';
	import PlayIcon from '@lucide/svelte/icons/play';
	import type { CronTriggerConfig } from '@repo/types';

	/** Returns a short human-readable label for the workflow's trigger. */
	function triggerLabel(workflow: Workflow): string {
		const t = workflow.trigger;
		if (!t) return 'No trigger';
		if (t.kind === 'cron') {
			const cfg = t.config as CronTriggerConfig;
			return cfg.schedule ? `Cron: ${cfg.schedule}` : 'Cron';
		}
		if (t.kind === 'webhook') return 'Webhook';
		return 'Manual';
	}

	type TriggerVariant = 'outline' | 'secondary' | 'default';
	function triggerVariant(workflow: Workflow): TriggerVariant {
		const kind = workflow.trigger?.kind;
		if (kind === 'cron') return 'outline';
		if (kind === 'webhook') return 'secondary';
		return 'outline';
	}

	let { data }: { data: PageData } = $props();

	let workflows = $state<Workflow[]>(data.workflows);

	$effect(() => {
		workflows = data.workflows;
	});

	// ── isEnabled toggle ──────────────────────────────────────────────────────
	async function toggleEnabled(workflow: Workflow) {
		const newValue = !workflow.isEnabled;
		// Optimistically update
		workflows = workflows.map((w) => (w.id === workflow.id ? { ...w, isEnabled: newValue } : w));

		try {
			const res = await api(`/agents/${data.agent.id}/workflows/${workflow.id}`, {
				method: 'PUT',
				body: JSON.stringify({ isEnabled: newValue })
			});
			if (!res.ok) {
				// Revert on failure
				workflows = workflows.map((w) =>
					w.id === workflow.id ? { ...w, isEnabled: !newValue } : w
				);
				setAlert({
					type: 'error',
					title: 'Failed to update workflow',
					message: 'Could not update the workflow status.',
					duration: 5000,
					show: true
				});
			}
		} catch {
			workflows = workflows.map((w) => (w.id === workflow.id ? { ...w, isEnabled: !newValue } : w));
			setAlert({
				type: 'error',
				title: 'Failed to update workflow',
				message: 'An unexpected error occurred.',
				duration: 5000,
				show: true
			});
		}
	}

	// ── Delete dialog ─────────────────────────────────────────────────────────
	let deleteDialogOpen = $state(false);
	let workflowToDelete = $state<Workflow | null>(null);
	let isDeleting = $state(false);

	function requestDelete(workflow: Workflow) {
		workflowToDelete = workflow;
		deleteDialogOpen = true;
	}

	async function confirmDelete() {
		if (!workflowToDelete) return;
		isDeleting = true;
		try {
			const res = await api(`/agents/${data.agent.id}/workflows/${workflowToDelete.id}`, {
				method: 'DELETE'
			});
			if (res.ok) {
				workflows = workflows.filter((w) => w.id !== workflowToDelete!.id);
				setAlert({
					type: 'success',
					title: 'Workflow deleted',
					message: `"${workflowToDelete.name}" has been removed.`,
					duration: 4000,
					show: true
				});
			} else {
				setAlert({
					type: 'error',
					title: 'Failed to delete workflow',
					message: 'Could not delete the workflow.',
					duration: 5000,
					show: true
				});
			}
		} catch {
			setAlert({
				type: 'error',
				title: 'Failed to delete workflow',
				message: 'An unexpected error occurred.',
				duration: 5000,
				show: true
			});
		} finally {
			isDeleting = false;
			deleteDialogOpen = false;
			workflowToDelete = null;
		}
	}

	function formatDate(iso: string | Date): string {
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{data.agent.name} — Workflows — AgentInt</title>
	<meta
		name="description"
		content="Create and manage automated workflows for {data.agent
			.name}. Build multi-step automation pipelines triggered by cron, webhook, or manually."
	/>
	<meta name="keywords" content="workflows, automation, AI agent, pipeline, AgentInt" />
</svelte:head>

<!-- ── Delete confirmation dialog ───────────────────────────────────────── -->
<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete workflow</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to delete <span class="font-medium text-foreground"
					>{workflowToDelete?.name}</span
				>? Any triggers pointing to this workflow will be unlinked.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="gap-2 sm:gap-0">
			<Button
				variant="outline"
				onclick={() => {
					deleteDialogOpen = false;
					workflowToDelete = null;
				}}
				disabled={isDeleting}
			>
				Cancel
			</Button>
			<Button variant="destructive" onclick={confirmDelete} disabled={isDeleting}>
				{isDeleting ? 'Deleting…' : 'Delete workflow'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- ── Page header ───────────────────────────────────────────────────────── -->
<PageHeader title="Workflows" description="Automated multi-step pipelines for {data.agent.name}.">
	{#snippet actions()}
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" onclick={() => goto(`/app/agents`)} class="gap-2">
				<ArrowLeftIcon class="size-4" />
				Back to agents
			</Button>
			<Button
				size="sm"
				onclick={() => goto(`/app/agents/${data.agent.id}/workflows/new`)}
				class="gap-2"
			>
				<PlusIcon class="size-4" />
				New workflow
			</Button>
		</div>
	{/snippet}
</PageHeader>

<!-- ── Workflow list ──────────────────────────────────────────────────────── -->
<Card.Root>
	<Card.Header class="pb-3">
		<Card.Title class="text-sm font-medium">Your workflows</Card.Title>
		<Card.Description class="text-xs">
			{workflows.length} workflow{workflows.length !== 1 ? 's' : ''} configured
		</Card.Description>
	</Card.Header>

	{#if workflows.length === 0}
		<Card.Content>
			<div class="flex flex-col items-center gap-3 py-10">
				<div
					class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
				>
					<ZapIcon class="size-5" />
				</div>
				<div class="text-center">
					<p class="text-sm font-medium text-foreground">No workflows yet</p>
					<p class="mt-0.5 text-xs text-muted-foreground">
						Create a workflow to automate multi-step tasks with this agent.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onclick={() => goto(`/app/agents/${data.agent.id}/workflows/new`)}
					class="gap-2"
				>
					<PlusIcon class="size-4" />
					Create first workflow
				</Button>
			</div>
		</Card.Content>
	{:else}
		<Card.Content class="p-0">
			<ul class="divide-y divide-border">
				{#each workflows as workflow (workflow.id)}
					<li class="flex items-start justify-between gap-4 px-6 py-4">
						<!-- Left: info -->
						<div class="flex min-w-0 flex-1 items-start gap-3">
							<div
								class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"
							>
								<ListIcon class="size-4 text-muted-foreground" />
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<p class="truncate text-sm font-medium text-foreground">{workflow.name}</p>
									<Badge variant="outline" class="shrink-0 text-xs">
										{workflow.steps.length} step{workflow.steps.length !== 1 ? 's' : ''}
									</Badge>
									<!-- Trigger kind badge -->
									<Badge
										variant={triggerVariant(workflow)}
										class="shrink-0 gap-1 text-xs"
										title={workflow.trigger ? `Trigger: ${workflow.trigger.name}` : 'No trigger'}
									>
										{#if workflow.trigger?.kind === 'cron'}
											<ClockIcon class="size-3" />
										{:else if workflow.trigger?.kind === 'webhook'}
											<WebhookIcon class="size-3" />
										{:else}
											<PlayIcon class="size-3" />
										{/if}
										{triggerLabel(workflow)}
									</Badge>
									{#if !workflow.isEnabled}
										<Badge variant="secondary" class="shrink-0 text-xs">Disabled</Badge>
									{/if}
								</div>
								{#if workflow.description}
									<p class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
										{workflow.description}
									</p>
								{/if}
								<p class="mt-0.5 text-xs text-muted-foreground">
									Updated {formatDate(workflow.updatedAt)}
								</p>
							</div>
						</div>

						<!-- Right: toggle + actions -->
						<div class="flex shrink-0 items-center gap-3">
							<!-- isEnabled toggle -->
							<div class="flex items-center gap-1.5">
								<Switch
									id="toggle-{workflow.id}"
									checked={workflow.isEnabled}
									onCheckedChange={() => toggleEnabled(workflow)}
									aria-label="Enable or disable workflow"
								/>
								<Label for="toggle-{workflow.id}" class="sr-only">Enable workflow</Label>
							</div>

							<!-- View runs -->
							<Button
								variant="ghost"
								size="sm"
								onclick={() => goto(`/app/agents/${data.agent.id}/workflows/${workflow.id}/runs`)}
								class="text-muted-foreground hover:text-foreground"
								title="View runs"
							>
								<ActivityIcon class="size-4" />
								<span class="sr-only">View runs for {workflow.name}</span>
							</Button>

							<!-- Edit -->
							<Button
								variant="ghost"
								size="sm"
								onclick={() =>
									goto(
										`/app/agents/${data.agent.id}/workflows/new?workflowId=${encodeURIComponent(workflow.id)}&editmode=true`
									)}
								class="text-muted-foreground hover:text-foreground"
								title="Edit workflow"
							>
								<PencilIcon class="size-4" />
								<span class="sr-only">Edit {workflow.name}</span>
							</Button>

							<!-- Delete -->
							<Button
								variant="ghost"
								size="sm"
								onclick={() => requestDelete(workflow)}
								class="text-destructive hover:bg-destructive/10 hover:text-destructive"
								title="Delete workflow"
							>
								<TrashIcon class="size-4" />
								<span class="sr-only">Delete {workflow.name}</span>
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		</Card.Content>
	{/if}
</Card.Root>

<script lang="ts">
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '$lib/api.client.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import type { PageData } from './$types';
	import type { Workflow, CronTriggerConfig } from '@repo/types';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import ListIcon from '@lucide/svelte/icons/list';
	import ZapIcon from '@lucide/svelte/icons/zap';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import WebhookIcon from '@lucide/svelte/icons/webhook';
	import PlayIcon from '@lucide/svelte/icons/play';
	import BlocksIcon from '@lucide/svelte/icons/blocks';
	import BotIcon from '@lucide/svelte/icons/bot';

	/** Returns a short human-readable label for the workflow's trigger. */
	function triggerLabel(workflow: Workflow): string {
		const t = workflow.trigger;
		if (!t) return 'No trigger';
		if (t.kind === 'cron') {
			const cfg = t.config as CronTriggerConfig;
			return cfg.schedule ? `Cron: ${cfg.schedule}` : 'Cron';
		}
		if (t.kind === 'webhook') return 'Webhook';
		if (t.kind === 'app') {
			const cfg = t.config as { provider?: string };
			return cfg.provider ? `App: ${cfg.provider}` : 'App event';
		}
		return 'Manual';
	}

	type TriggerVariant = 'outline' | 'secondary' | 'default';
	function triggerVariant(workflow: Workflow): TriggerVariant {
		const kind = workflow.trigger?.kind;
		if (kind === 'cron') return 'outline';
		if (kind === 'webhook') return 'secondary';
		if (kind === 'app') return 'default';
		return 'outline';
	}

	let { data }: { data: PageData } = $props();

	let workflows = $state<Workflow[]>(data.workflows);

	$effect(() => {
		workflows = data.workflows;
	});

	/** Lookup of agentId → agent name for row labels. */
	let agentNameById = $derived(new Map(data.agents.map((a) => [a.id, a.name])));

	function agentName(agentId: string): string {
		return agentNameById.get(agentId) ?? 'Unknown agent';
	}

	// ── Agent filter ──────────────────────────────────────────────────────────
	// The selected agent lives in the `?agentId=` query param so the URL stays
	// shareable and the breadcrumb can reflect it. The dropdown reads from / writes
	// to the param — selecting an agent updates the URL (without a server refetch).
	const ALL_AGENTS = 'all';

	/** Resolve the filter from the `?agentId=` param — used to seed the initial value. */
	function agentFilterFromUrl(): string {
		const id = page.url.searchParams.get('agentId');
		return id && data.agents.some((a) => a.id === id) ? id : ALL_AGENTS;
	}

	// Local reactive state, seeded from the URL. IMPORTANT: SvelteKit's `replaceState`
	// updates the address bar but NOT the reactive `page.url`, so the filter cannot be
	// derived from `page.url` — selecting an agent would never re-filter the list. We hold
	// the selection here (drives the list + dropdown immediately) and mirror it into the
	// URL on change so the page stays shareable.
	let agentFilter = $state(agentFilterFromUrl());

	/** Update the filter and reflect the choice into the shareable `?agentId=` param. */
	function onAgentFilterChange(value: string) {
		agentFilter = value;
		const target = value === ALL_AGENTS ? '/app/workflows' : `/app/workflows?agentId=${value}`;
		if (page.url.pathname + page.url.search !== target) {
			replaceState(target, {});
		}
	}

	let filteredWorkflows = $derived(
		agentFilter === ALL_AGENTS ? workflows : workflows.filter((w) => w.agentId === agentFilter)
	);

	let agentFilterLabel = $derived(
		agentFilter === ALL_AGENTS ? 'All agents' : agentName(agentFilter)
	);

	// ── isEnabled toggle ──────────────────────────────────────────────────────
	async function toggleEnabled(workflow: Workflow) {
		const newValue = !workflow.isEnabled;
		// Optimistically update
		workflows = workflows.map((w) => (w.id === workflow.id ? { ...w, isEnabled: newValue } : w));

		try {
			const res = await api(`/agents/${workflow.agentId}/workflows/${workflow.id}`, {
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
			const res = await api(
				`/agents/${workflowToDelete.agentId}/workflows/${workflowToDelete.id}`,
				{ method: 'DELETE' }
			);
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
	<title>Workflows — Valmis</title>
	<meta
		name="description"
		content="Manage all automated workflows across your agents. Build multi-step automation pipelines triggered by cron, webhook, or manually."
	/>
	<meta name="keywords" content="workflows, automation, AI agent, pipeline, Valmis" />
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
<PageHeader title="Workflows" description="All automated multi-step pipelines across your agents.">
	{#snippet actions()}
		<!-- Workflows are always created under an agent — pick one first -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button size="sm" class="gap-2" disabled={data.agents.length === 0} {...props}>
						<PlusIcon class="size-4" />
						New workflow
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="min-w-48">
				<DropdownMenu.Label>Choose an agent</DropdownMenu.Label>
				<DropdownMenu.Separator />
				{#each data.agents as agent (agent.id)}
					<DropdownMenu.Item onSelect={() => goto(`/app/agents/${agent.id}/workflows/new`)}>
						<BotIcon class="mr-2 size-4" />
						{agent.name}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/snippet}
</PageHeader>

<!-- ── Workflow list ──────────────────────────────────────────────────────── -->
<Card.Root>
	<Card.Header class="flex flex-row items-start justify-between gap-4 pb-3">
		<div>
			<Card.Title class="text-sm font-medium">Your workflows</Card.Title>
			<Card.Description class="text-xs">
				{filteredWorkflows.length} workflow{filteredWorkflows.length !== 1 ? 's' : ''}
				{agentFilter === ALL_AGENTS ? 'across all agents' : `for ${agentFilterLabel}`}
			</Card.Description>
		</div>

		<!-- Agent filter -->
		<div class="flex items-center gap-2">
			<Label for="agent-filter" class="text-xs text-muted-foreground">Agent</Label>
			<Select.Root
				type="single"
				value={agentFilter}
				onValueChange={onAgentFilterChange}
				name="agentFilter"
			>
				<Select.Trigger id="agent-filter" class="w-48" size="sm">
					{agentFilterLabel}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value={ALL_AGENTS} label="All agents">All agents</Select.Item>
					{#each data.agents as agent (agent.id)}
						<Select.Item value={agent.id} label={agent.name}>{agent.name}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</Card.Header>

	{#if filteredWorkflows.length === 0}
		<Card.Content>
			<div class="flex flex-col items-center gap-3 py-10">
				<div
					class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
				>
					<ZapIcon class="size-5" />
				</div>
				<div class="text-center">
					<p class="text-sm font-medium text-foreground">
						{agentFilter === ALL_AGENTS ? 'No workflows yet' : 'No workflows for this agent'}
					</p>
					<p class="mt-0.5 text-xs text-muted-foreground">
						{#if data.agents.length === 0}
							Create an agent first, then build workflows to automate multi-step tasks.
						{:else}
							Create a workflow to automate multi-step tasks with your agents.
						{/if}
					</p>
				</div>
				{#if data.agents.length === 0}
					<Button variant="outline" size="sm" onclick={() => goto('/app/agents/new')} class="gap-2">
						<PlusIcon class="size-4" />
						Create an agent
					</Button>
				{:else if agentFilter !== ALL_AGENTS}
					<Button
						variant="outline"
						size="sm"
						onclick={() => goto(`/app/agents/${agentFilter}/workflows/new`)}
						class="gap-2"
					>
						<PlusIcon class="size-4" />
						Create first workflow
					</Button>
				{/if}
			</div>
		</Card.Content>
	{:else}
		<Card.Content class="p-0">
			<ul class="divide-y divide-border">
				{#each filteredWorkflows as workflow (workflow.id)}
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
									<!-- Owning agent badge -->
									<Badge variant="secondary" class="shrink-0 gap-1 text-xs">
										<BotIcon class="size-3" />
										{agentName(workflow.agentId)}
									</Badge>
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
										{:else if workflow.trigger?.kind === 'app'}
											<BlocksIcon class="size-3" />
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
								onclick={() =>
									goto(`/app/agents/${workflow.agentId}/workflows/${workflow.id}/runs`)}
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
										`/app/agents/${workflow.agentId}/workflows/new?workflowId=${encodeURIComponent(workflow.id)}&editmode=true`
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

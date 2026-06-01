<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api.client.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import { authStore } from '$lib/stores/auth.store.js';
	import { get } from 'svelte/store';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import BotIcon from '@lucide/svelte/icons/bot';
	import type { PageData } from './$types';
	import type { Agent, CredentialMetadata } from '@repo/types';

	let { data }: { data: PageData } = $props();

	let agents = $state<Agent[]>([]);
	let credentials = $state<CredentialMetadata[]>([]);
	$effect(() => {
		agents = data.agents;
		credentials = data.credentials;
	});

	// ── Delete dialog ─────────────────────────────────────────────────────────
	let deleteDialogOpen = $state(false);
	let agentToDelete = $state<Agent | null>(null);
	let isDeleting = $state(false);

	function requestDelete(agent: Agent) {
		agentToDelete = agent;
		deleteDialogOpen = true;
	}

	async function confirmDelete() {
		if (!agentToDelete) return;
		isDeleting = true;

		const { user } = get(authStore);
		if (!user) {
			isDeleting = false;
			return;
		}

		try {
			const res = await api(`/agents/${agentToDelete.id}`, {
				method: 'DELETE',
				body: JSON.stringify({ ownerId: user.id })
			});
			if (res.ok) {
				agents = agents.filter((a) => a.id !== agentToDelete!.id);
			}
		} catch {
			// silently ignore
		} finally {
			isDeleting = false;
			deleteDialogOpen = false;
			agentToDelete = null;
		}
	}

	// ── Helpers ────────────────────────────────────────────────────────────────
	function formatDate(iso: string | Date): string {
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function getCredentialName(credId: string): string {
		return credentials.find((c) => c.id === credId)?.name ?? credId.slice(0, 8);
	}

	/**
	 * Detects if a string is a single emoji character.
	 * Used to decide how to render the avatar (text vs img).
	 */
	function isEmoji(str: string | undefined): boolean {
		if (!str) return false;
		const segments = [...str];
		return segments.length === 1 && /\p{Emoji}/u.test(str);
	}
</script>

<svelte:head>
	<title>Agents — OpenAgent Dashboard</title>
	<meta
		name="description"
		content="Create and manage your AI agents. Configure custom personas with unique instructions, knowledge, and service credentials."
	/>
	<meta
		name="keywords"
		content="AI agents, custom agents, personas, knowledge base, OpenAgent, agent management"
	/>
</svelte:head>

<!-- ── Delete confirmation dialog ───────────────────────────────────────── -->
<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete agent</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to delete <span class="font-medium text-foreground"
					>{agentToDelete?.name}</span
				>? All memory and configurations for this agent will be permanently removed.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="gap-2 sm:gap-0">
			<Button
				variant="outline"
				onclick={() => {
					deleteDialogOpen = false;
					agentToDelete = null;
				}}
				disabled={isDeleting}
			>
				Cancel
			</Button>
			<Button variant="destructive" onclick={confirmDelete} disabled={isDeleting}>
				{isDeleting ? 'Deleting…' : 'Delete agent'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- ── Page ─────────────────────────────────────────────────────────────── -->
<PageHeader
	title="Agents"
	description="Create and manage AI agents with custom personas, instructions, and access to your credentials."
>
	{#snippet actions()}
		<Button onclick={() => goto('/app/agents/new')} class="gap-2">
			<PlusIcon class="size-4" />
			New agent
		</Button>
	{/snippet}
</PageHeader>

<!-- Agent list -->
<Card.Root>
	<Card.Header class="pb-3">
		<Card.Title class="text-sm font-medium">Your agents</Card.Title>
		<Card.Description class="text-xs">
			{agents.length} agent{agents.length !== 1 ? 's' : ''} configured
		</Card.Description>
	</Card.Header>

	{#if agents.length === 0}
		<Card.Content>
			<div class="flex flex-col items-center gap-3 py-10">
				<div
					class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
				>
					<BotIcon class="size-5" />
				</div>
				<div class="text-center">
					<p class="text-sm font-medium text-foreground">No agents yet</p>
					<p class="mt-0.5 text-xs text-muted-foreground">
						Create your first agent to get started.
					</p>
				</div>
				<Button variant="outline" size="sm" onclick={() => goto('/app/agents/new')} class="gap-2">
					<PlusIcon class="size-4" />
					Create your first agent
				</Button>
			</div>
		</Card.Content>
	{:else}
		<Card.Content class="p-0">
			<ul class="divide-y divide-border">
				{#each agents as agent (agent.id)}
					<li class="flex items-start justify-between gap-4 px-6 py-4">
						<!-- Left: avatar + identity -->
						<div class="flex min-w-0 flex-1 items-start gap-3">
							<div
								class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-lg"
							>
								{#if isEmoji(agent.avatarUrl)}
									<span>{agent.avatarUrl}</span>
								{:else if agent.avatarUrl}
									<img
										src={agent.avatarUrl}
										alt={agent.name}
										class="size-9 rounded-lg object-cover"
									/>
								{:else}
									<BotIcon class="size-4 text-muted-foreground" />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<p class="truncate text-sm font-medium text-foreground">{agent.name}</p>
									{#if agent.credentialIds.length > 0}
										<Badge variant="secondary" class="shrink-0 text-xs">
											{agent.credentialIds.length} credential{agent.credentialIds.length !== 1
												? 's'
												: ''}
										</Badge>
									{/if}
								</div>
								{#if agent.description}
									<p class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
										{agent.description}
									</p>
								{/if}
								<p class="mt-0.5 text-xs text-muted-foreground">
									Created {formatDate(agent.createdAt)}
								</p>
							</div>
						</div>

						<!-- Right: actions -->
						<div class="flex shrink-0 items-center gap-1">
							<Button
								variant="ghost"
								size="sm"
								onclick={() => goto(`/app/agents/new?id=${agent.id}&editmode=true`)}
								class="text-muted-foreground hover:text-foreground"
								title="Edit agent"
							>
								<PencilIcon class="size-4" />
								<span class="sr-only">Edit {agent.name}</span>
							</Button>

							<Button
								variant="ghost"
								size="sm"
								onclick={() => requestDelete(agent)}
								class="text-destructive hover:bg-destructive/10 hover:text-destructive"
								title="Delete agent"
							>
								<TrashIcon class="size-4" />
								<span class="sr-only">Delete {agent.name}</span>
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		</Card.Content>
	{/if}
</Card.Root>

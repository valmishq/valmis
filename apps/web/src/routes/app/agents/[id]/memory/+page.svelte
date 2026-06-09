<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api.client.js';
	import { authStore } from '$lib/stores/auth.store.js';
	import { get } from 'svelte/store';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import type { PageData } from './$types';
	import type { AgentMemoryEntry, MemoryType } from '@repo/types';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import BrainIcon from '@lucide/svelte/icons/brain';
	import TrashIcon from '@lucide/svelte/icons/trash-2';

	let { data }: { data: PageData } = $props();

	// Local mutable copy of memory entries so we can optimistically remove deleted rows
	let memory = $state<AgentMemoryEntry[]>(data.memory);

	$effect(() => {
		memory = data.memory;
	});

	// ── Deletion ───────────────────────────────────────────────────────────────

	let deletingMemoryId = $state<string | null>(null);

	async function handleDeleteMemory(entryId: string) {
		const { user } = get(authStore);
		if (!user) return;

		deletingMemoryId = entryId;
		try {
			const res = await api(`/agents/${data.agent.id}/memory/${entryId}`, {
				method: 'DELETE',
				body: JSON.stringify({ ownerId: user.id })
			});

			if (res.ok) {
				// Optimistic removal from the local list
				memory = memory.filter((m) => m.id !== entryId);
			} else {
				setAlert({
					type: 'error',
					title: 'Failed to delete memory',
					message: 'Could not delete the memory entry.',
					duration: 5000,
					show: true
				});
			}
		} catch {
			setAlert({
				type: 'error',
				title: 'Failed to delete memory',
				message: 'An unexpected error occurred.',
				duration: 5000,
				show: true
			});
		} finally {
			deletingMemoryId = null;
		}
	}

	// ── Formatting helpers ─────────────────────────────────────────────────────

	function formatDate(iso: string | Date): string {
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	/**
	 * Returns a shadcn badge variant for the memory type.
	 * episodic → outline, semantic → secondary, procedural → default, working → outline
	 */
	function memoryTypeBadgeVariant(
		type: MemoryType
	): 'default' | 'secondary' | 'destructive' | 'outline' {
		switch (type) {
			case 'semantic':
				return 'secondary';
			case 'procedural':
				return 'default';
			case 'episodic':
			case 'working':
			default:
				return 'outline';
		}
	}

	const totalEntries = $derived(memory.length);
</script>

<svelte:head>
	<title>{data.agent.name} — Memory — OpenAgent Dashboard</title>
	<meta
		name="description"
		content="Manage long-term memory entries stored by {data.agent
			.name}. View and delete vector memory used across conversations."
	/>
	<meta
		name="keywords"
		content="agent memory, AI memory management, vector memory, long-term memory, OpenAgent"
	/>
</svelte:head>

<!-- ── Page header ───────────────────────────────────────────────────────── -->
<PageHeader
	title="Memory"
	description="Long-term memory entries stored by {data.agent
		.name}. Searchable at runtime via vector similarity."
>
	{#snippet actions()}
		<Button variant="outline" size="sm" onclick={() => goto(`/app/agents`)} class="gap-2">
			<ArrowLeftIcon class="size-4" />
			Back to agents
		</Button>
	{/snippet}
</PageHeader>

<!-- ── Summary card ───────────────────────────────────────────────────────── -->
<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
	<Card.Root>
		<Card.Content class="pt-6">
			<div class="flex items-center gap-3">
				<div class="flex size-9 items-center justify-center rounded-lg bg-muted">
					<BrainIcon class="size-4 text-muted-foreground" />
				</div>
				<div>
					<p class="text-2xl leading-none font-semibold">{totalEntries}</p>
					<p class="mt-1 text-xs text-muted-foreground">Memory entries</p>
				</div>
			</div>
		</Card.Content>
	</Card.Root>
</div>

<!-- ── Memory entries ─────────────────────────────────────────────────────── -->
<Card.Root>
	<Card.Header class="pb-3">
		<Card.Title class="text-sm font-medium">Entries</Card.Title>
		<Card.Description class="text-xs">
			Memory is written by the agent during conversations. You can delete individual entries here.
		</Card.Description>
	</Card.Header>

	<Card.Content>
		{#if memory.length === 0}
			<div class="flex flex-col items-center gap-2 py-10">
				<div
					class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
				>
					<BrainIcon class="size-5" />
				</div>
				<div class="text-center">
					<p class="text-sm font-medium text-foreground">No memory entries yet</p>
					<p class="mt-0.5 text-xs text-muted-foreground">
						Memory is populated by the agent during conversations.
					</p>
				</div>
			</div>
		{:else}
			<div class="space-y-2">
				{#each memory as entry (entry.id)}
					<div
						class="flex items-start gap-3 rounded-md border border-border px-3 py-2.5 transition-colors hover:bg-muted/30"
					>
						<div class="min-w-0 flex-1">
							<p class="text-sm text-foreground">{entry.content}</p>
							<div class="mt-1.5 flex items-center gap-2">
								<!-- Memory type badge -->
								<Badge
									variant={memoryTypeBadgeVariant(entry.memoryType)}
									class="text-xs capitalize"
								>
									{entry.memoryType}
								</Badge>
								<span class="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
							</div>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => handleDeleteMemory(entry.id)}
							disabled={deletingMemoryId === entry.id}
							class="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
							title="Delete memory entry"
						>
							<TrashIcon class="size-3.5" />
						</Button>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>

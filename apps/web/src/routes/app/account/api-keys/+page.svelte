<script lang="ts">
	import { api } from '$lib/api.client.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import CheckIcon from '@lucide/svelte/icons/check';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import type { PageData } from './$types';
	import type { ApiKey } from '@repo/types';

	let { data }: { data: PageData } = $props();

	// Mutable local list — synced from SSR data and updated by client-side mutations
	let keys = $state<ApiKey[]>([]);
	$effect(() => {
		keys = data.keys;
	});

	// Form state for generating a new key
	let name = $state('');
	let expiresInDays = $state(30);
	let isGenerating = $state(false);
	let generateError = $state('');

	// The newly created raw key (shown once, immediately after generation)
	let newRawKey = $state('');
	let copied = $state(false);

	// Delete confirmation dialog state
	let deleteDialogOpen = $state(false);
	let keyToDelete = $state<ApiKey | null>(null);
	let isDeleting = $state(false);

	async function handleGenerate(e: SubmitEvent) {
		e.preventDefault();
		isGenerating = true;
		generateError = '';
		newRawKey = '';
		copied = false;

		try {
			const res = await api('/api-keys', {
				method: 'POST',
				body: JSON.stringify({ name, expiresInDays })
			});

			if (!res.ok) {
				const body = await res.json();
				generateError = body.error ?? 'Failed to generate key';
				return;
			}

			const body = await res.json();
			newRawKey = body.data.key as string;
			name = '';
			expiresInDays = 30;

			await refreshKeys();
		} catch {
			generateError = 'An unexpected error occurred';
		} finally {
			isGenerating = false;
		}
	}

	/** Opens the delete confirmation dialog for the given key. */
	function requestDelete(key: ApiKey) {
		keyToDelete = key;
		deleteDialogOpen = true;
	}

	/** Called when user confirms deletion in the dialog. */
	async function confirmDelete() {
		if (!keyToDelete) return;
		isDeleting = true;

		try {
			const res = await api(`/api-keys/${keyToDelete.id}`, { method: 'DELETE' });
			if (res.ok) {
				keys = keys.filter((k) => k.id !== keyToDelete!.id);
			}
		} catch {
			// silently ignore — list will be stale until page refresh
		} finally {
			isDeleting = false;
			deleteDialogOpen = false;
			keyToDelete = null;
		}
	}

	async function refreshKeys() {
		try {
			const res = await api('/api-keys');
			if (res.ok) {
				const body = await res.json();
				keys = (body.data ?? []) as ApiKey[];
			}
		} catch {
			// silently ignore
		}
	}

	async function copyKey() {
		await navigator.clipboard.writeText(newRawKey);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function isExpired(iso: string): boolean {
		return new Date(iso) < new Date();
	}
</script>

<svelte:head>
	<title>API Keys — OpenAgent Dashboard</title>
	<meta
		name="description"
		content="Manage your OpenAgent API keys for secure programmatic access to integrations."
	/>
	<meta name="keywords" content="API keys, authentication, OpenAgent, integration, access tokens" />
</svelte:head>

<!-- Delete confirmation dialog -->
<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete API key</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to delete <span class="font-medium text-foreground"
					>{keyToDelete?.name}</span
				>? This action cannot be undone and any integrations using this key will stop working.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="gap-2 sm:gap-0">
			<Button
				variant="outline"
				onclick={() => {
					deleteDialogOpen = false;
					keyToDelete = null;
				}}
				disabled={isDeleting}
			>
				Cancel
			</Button>
			<Button variant="destructive" onclick={confirmDelete} disabled={isDeleting}>
				{isDeleting ? 'Deleting…' : 'Delete key'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<PageHeader
	title="API Keys"
	description="Generate keys to authenticate programmatic access. The full key is shown only once at creation."
/>

<!-- Generate new key -->
<Card.Root>
	<Card.Header class="pb-4">
		<Card.Title class="text-sm font-medium">Generate new key</Card.Title>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if generateError}
			<p class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
				{generateError}
			</p>
		{/if}

		{#if newRawKey}
			<!-- One-time key display -->
			<div class="rounded-md border border-border bg-muted/40 p-4">
				<p class="mb-2 text-sm font-medium text-foreground">
					Key generated — copy it now. It will not be shown again.
				</p>
				<div class="flex items-center gap-2">
					<code
						class="flex-1 overflow-x-auto rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
					>
						{newRawKey}
					</code>
					<Button variant="outline" size="sm" onclick={copyKey} class="shrink-0 gap-1.5">
						{#if copied}
							<CheckIcon class="size-3.5" />
							Copied
						{:else}
							<CopyIcon class="size-3.5" />
							Copy
						{/if}
					</Button>
				</div>
			</div>
		{/if}

		<form onsubmit={handleGenerate} class="flex flex-wrap items-end gap-3">
			<div class="min-w-44 flex-1 space-y-1.5">
				<Label for="keyName">Name</Label>
				<Input
					id="keyName"
					type="text"
					bind:value={name}
					required
					placeholder="e.g. CI / Local dev"
				/>
			</div>

			<div class="w-40 space-y-1.5">
				<Label for="expiresInDays">Expires in (days)</Label>
				<Input
					id="expiresInDays"
					type="number"
					bind:value={expiresInDays}
					min="1"
					max="365"
					required
				/>
			</div>

			<Button type="submit" disabled={isGenerating}>
				{isGenerating ? 'Generating…' : 'Generate key'}
			</Button>
		</form>
	</Card.Content>
</Card.Root>

<!-- Existing keys list -->
<Card.Root>
	<Card.Header class="pb-3">
		<Card.Title class="text-sm font-medium">Your keys</Card.Title>
		<Card.Description class="text-xs">
			{keys.length} key{keys.length !== 1 ? 's' : ''} total
		</Card.Description>
	</Card.Header>

	{#if keys.length === 0}
		<Card.Content>
			<p class="py-4 text-center text-sm text-muted-foreground">No API keys yet.</p>
		</Card.Content>
	{:else}
		<Card.Content class="p-0">
			<ul class="divide-y divide-border">
				{#each keys as key (key.id)}
					<li class="flex items-center justify-between gap-4 px-6 py-4">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<p class="truncate text-sm font-medium text-foreground">{key.name}</p>
								{#if isExpired(key.expiresAt)}
									<Badge variant="destructive" class="shrink-0 text-xs">Expired</Badge>
								{:else}
									<Badge variant="secondary" class="shrink-0 text-xs">Active</Badge>
								{/if}
							</div>
							<p class="mt-0.5 font-mono text-xs text-muted-foreground">
								{key.key}
								<span class="font-sans"> · expires {formatDate(key.expiresAt)}</span>
								<span class="font-sans"> · created {formatDate(key.createdAt)}</span>
							</p>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onclick={() => requestDelete(key)}
							class="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
						>
							<TrashIcon class="size-4" />
							<span class="sr-only">Delete {key.name}</span>
						</Button>
					</li>
				{/each}
			</ul>
		</Card.Content>
	{/if}
</Card.Root>

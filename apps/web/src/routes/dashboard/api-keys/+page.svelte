<script lang="ts">
	import { api } from '$lib/api.client.js';
	import type { PageData } from './$types';
	import type { ApiKey } from '@repo/types';

	let { data }: { data: PageData } = $props();

	// Mutable local list — initialized from SSR data, updated by client-side mutations.
	// $effect keeps it in sync if the server data changes (e.g. invalidation).
	let keys = $state<ApiKey[]>(data.keys);
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

			// Refresh the list
			await refreshKeys();
		} catch {
			generateError = 'An unexpected error occurred';
		} finally {
			isGenerating = false;
		}
	}

	async function handleDelete(id: string) {
		if (!confirm('Delete this API key? This cannot be undone.')) return;

		try {
			const res = await api(`/api-keys/${id}`, { method: 'DELETE' });
			if (res.ok) {
				keys = keys.filter((k) => k.id !== id);
			}
		} catch {
			// silently ignore — list will be stale until page refresh
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
</script>

<svelte:head>
	<title>API Keys — Dashboard</title>
	<meta name="description" content="Manage your personal API keys" />
</svelte:head>

<div class="space-y-8">
	<div>
		<h1 class="text-xl font-semibold text-gray-900">API Keys</h1>
		<p class="mt-1 text-sm text-gray-500">
			Generate API keys to authenticate programmatic access. The full key is shown only once at
			creation.
		</p>
	</div>

	<!-- Generate new key form -->
	<div class="rounded-lg border border-gray-200 bg-white p-6">
		<h2 class="mb-4 text-sm font-semibold text-gray-900">Generate new key</h2>

		{#if generateError}
			<p class="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
				{generateError}
			</p>
		{/if}

		{#if newRawKey}
			<div class="mb-4 rounded border border-green-200 bg-green-50 p-4">
				<p class="mb-2 text-sm font-medium text-green-800">
					Key generated — copy it now. It will not be shown again.
				</p>
				<div class="flex items-center gap-2">
					<code
						class="flex-1 overflow-x-auto rounded border border-green-200 bg-white px-3 py-2 font-mono text-xs text-gray-800"
					>
						{newRawKey}
					</code>
					<button
						onclick={copyKey}
						class="shrink-0 rounded border border-green-300 bg-white px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-50"
					>
						{copied ? 'Copied!' : 'Copy'}
					</button>
				</div>
			</div>
		{/if}

		<form onsubmit={handleGenerate} class="flex flex-wrap items-end gap-3">
			<div class="min-w-40 flex-1">
				<label for="keyName" class="mb-1 block text-sm font-medium text-gray-700">Name</label>
				<input
					id="keyName"
					type="text"
					bind:value={name}
					required
					placeholder="e.g. CI / Local dev"
					class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
				/>
			</div>

			<div class="w-36">
				<label for="expiresInDays" class="mb-1 block text-sm font-medium text-gray-700"
					>Expires in (days)</label
				>
				<input
					id="expiresInDays"
					type="number"
					bind:value={expiresInDays}
					min="1"
					max="365"
					required
					class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
				/>
			</div>

			<button
				type="submit"
				disabled={isGenerating}
				class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
			>
				{isGenerating ? 'Generating…' : 'Generate'}
			</button>
		</form>
	</div>

	<!-- Existing keys list -->
	<div class="rounded-lg border border-gray-200 bg-white">
		<div class="border-b border-gray-200 px-6 py-4">
			<h2 class="text-sm font-semibold text-gray-900">Your keys</h2>
		</div>

		{#if keys.length === 0}
			<p class="px-6 py-8 text-center text-sm text-gray-400">No API keys yet.</p>
		{:else}
			<ul class="divide-y divide-gray-100">
				{#each keys as key (key.id)}
					<li class="flex items-center justify-between gap-4 px-6 py-4">
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-gray-900">{key.name}</p>
							<p class="mt-0.5 text-xs text-gray-400">
								<code class="font-mono">{key.key}</code>
								&nbsp;·&nbsp; expires {formatDate(key.expiresAt)}
								&nbsp;·&nbsp; created {formatDate(key.createdAt)}
							</p>
						</div>
						<button
							onclick={() => handleDelete(key.id)}
							class="shrink-0 rounded border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
						>
							Delete
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

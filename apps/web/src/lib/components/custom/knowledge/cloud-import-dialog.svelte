<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { api } from '$lib/api.client.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FileIcon from '@lucide/svelte/icons/file';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import type { CloudFileEntry, KnowledgeFile, KnowledgeProviderInfo } from '@repo/types';

	interface Props {
		open: boolean;
		/** Called with the created library rows (status 'pending') after import */
		onImported: (files: KnowledgeFile[]) => void;
	}

	let { open = $bindable(), onImported }: Props = $props();

	/** Mirrors the backend allowlist; Google-native files convert server-side */
	const ALLOWED_EXTENSIONS = new Set([
		'pdf',
		'docx',
		'xlsx',
		'pptx',
		'txt',
		'md',
		'markdown',
		'csv',
		'json',
		'html',
		'htm'
	]);
	const GOOGLE_NATIVE_MIMES = new Set([
		'application/vnd.google-apps.document',
		'application/vnd.google-apps.spreadsheet',
		'application/vnd.google-apps.presentation'
	]);
	const SEARCH_DEBOUNCE_MS = 400;

	function isImportable(entry: CloudFileEntry): boolean {
		if (entry.kind === 'folder') return false;
		if (entry.mimeType && GOOGLE_NATIVE_MIMES.has(entry.mimeType)) return true;
		const idx = entry.name.lastIndexOf('.');
		if (idx === -1) return false;
		return ALLOWED_EXTENSIONS.has(entry.name.slice(idx + 1).toLowerCase());
	}

	// ── Step 1: provider + credential selection ───────────────────────────────
	let providers = $state<KnowledgeProviderInfo[] | null>(null);
	let providersLoading = $state(false);
	/** Error flag only — the detailed message goes through setAlert */
	let providersError = $state(false);
	let selectedProviderId = $state('');
	let selectedCredentialId = $state('');

	const selectedProvider = $derived(providers?.find((p) => p.id === selectedProviderId) ?? null);
	const credentialTriggerLabel = $derived(
		selectedProvider?.credentials.find((c) => c.id === selectedCredentialId)?.name ??
			'Select a credential'
	);

	async function fetchProvidersIfNeeded() {
		if (providers !== null) return;
		providersLoading = true;
		providersError = false;
		try {
			const res = await api('/knowledge/providers');
			if (!res.ok) throw new Error('failed');
			const body = await res.json();
			providers = (body.data ?? []) as KnowledgeProviderInfo[];
		} catch {
			providersError = true;
			setAlert({
				type: 'error',
				title: 'Could not load cloud providers',
				message: 'Please try again.',
				duration: 5000,
				show: true
			});
		} finally {
			providersLoading = false;
		}
	}

	// Lazy-load providers when the dialog opens; reset transient state on close
	$effect(() => {
		if (open) {
			void fetchProvidersIfNeeded();
		} else {
			step = 'source';
			selectedFiles = new Map();
			entries = [];
			folderStack = [];
			nextPageToken = undefined;
			searchQuery = '';
		}
	});

	function selectProvider(providerId: string) {
		if (providerId !== selectedProviderId) {
			selectedCredentialId = '';
		}
		selectedProviderId = providerId;
		const creds = providers?.find((p) => p.id === providerId)?.credentials ?? [];
		if (creds.length === 1) {
			selectedCredentialId = creds[0].id;
		}
	}

	// ── Step 2: file browser ──────────────────────────────────────────────────
	let step = $state<'source' | 'browse'>('source');
	let entries = $state<CloudFileEntry[]>([]);
	let browseLoading = $state(false);
	/** Error flag only — the detailed message goes through setAlert */
	let browseError = $state(false);
	let nextPageToken = $state<string | undefined>(undefined);
	/** Folder navigation stack — empty means provider root */
	let folderStack = $state<{ id: string; name: string }[]>([]);
	/** Selected files keyed by externalId — full entry kept for the import payload */
	let selectedFiles = $state<Map<string, CloudFileEntry>>(new Map());
	let searchQuery = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	const currentFolderId = $derived(
		folderStack.length > 0 ? folderStack[folderStack.length - 1].id : undefined
	);

	async function browse(options: { append?: boolean } = {}) {
		browseLoading = true;
		browseError = false;
		try {
			const params = new URLSearchParams({ credentialId: selectedCredentialId });
			if (options.append && nextPageToken) params.set('pageToken', nextPageToken);
			if (searchQuery.trim()) params.set('search', searchQuery.trim());
			else if (currentFolderId) params.set('folderId', currentFolderId);

			const res = await api(`/knowledge/providers/${selectedProviderId}/files?${params}`);
			const body = await res.json();
			if (!res.ok || !body.success) {
				browseError = true;
				setAlert({
					type: 'error',
					title: 'Could not list files',
					message: body.error ?? 'The cloud provider request failed. Please try again.',
					duration: 6000,
					show: true
				});
				return;
			}
			const data = body.data as { entries: CloudFileEntry[]; nextPageToken?: string };
			entries = options.append ? [...entries, ...data.entries] : data.entries;
			nextPageToken = data.nextPageToken;
		} catch {
			browseError = true;
			setAlert({
				type: 'error',
				title: 'Could not list files',
				message: 'Could not reach the server. Please try again.',
				duration: 5000,
				show: true
			});
		} finally {
			browseLoading = false;
		}
	}

	function startBrowsing() {
		step = 'browse';
		folderStack = [];
		searchQuery = '';
		void browse();
	}

	function openFolder(entry: CloudFileEntry) {
		folderStack = [...folderStack, { id: entry.externalId, name: entry.name }];
		searchQuery = '';
		void browse();
	}

	function navigateToDepth(depth: number) {
		folderStack = folderStack.slice(0, depth);
		searchQuery = '';
		void browse();
	}

	function onSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => void browse(), SEARCH_DEBOUNCE_MS);
	}

	function toggleFile(entry: CloudFileEntry) {
		const next = new Map(selectedFiles);
		if (next.has(entry.externalId)) next.delete(entry.externalId);
		else next.set(entry.externalId, entry);
		selectedFiles = next;
	}

	// ── Import ────────────────────────────────────────────────────────────────
	let importing = $state(false);

	async function confirmImport() {
		if (selectedFiles.size === 0) return;
		importing = true;
		try {
			const res = await api('/knowledge/files/import', {
				method: 'POST',
				body: JSON.stringify({
					provider: selectedProviderId,
					credentialId: selectedCredentialId,
					files: [...selectedFiles.values()].map((entry) => ({
						externalId: entry.externalId,
						name: entry.name,
						mimeType: entry.mimeType,
						path: entry.path,
						sizeBytes: entry.sizeBytes
					}))
				})
			});
			const body = await res.json();
			if (!res.ok || !body.success) {
				setAlert({
					type: 'error',
					title: 'Import failed',
					message: body.error ?? 'Could not import the selected files.',
					duration: 5000,
					show: true
				});
				return;
			}
			const created = (body.data ?? []) as KnowledgeFile[];
			setAlert({
				type: 'success',
				title: 'Import started',
				message: `${created.length} file${created.length === 1 ? '' : 's'} queued for download and text extraction.`,
				duration: 4000,
				show: true
			});
			onImported(created);
			open = false;
		} catch {
			setAlert({
				type: 'error',
				title: 'Import failed',
				message: 'Could not reach the server. Please try again.',
				duration: 5000,
				show: true
			});
		} finally {
			importing = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<!--
		sm:max-w-2xl (not max-w-2xl) — the Dialog.Content base classes include
		sm:max-w-md, which an unprefixed max-w-* cannot replace via tailwind-merge.
		min-w-0 on the direct children — Dialog.Content is a CSS grid and grid
		items default to min-width:auto, so wide content (long file names, error
		strings) would otherwise blow the track out past the dialog edge.
	-->
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header class="min-w-0">
			<Dialog.Title>Import from cloud</Dialog.Title>
			<Dialog.Description>
				{#if step === 'source'}
					Choose a cloud provider and the credential to browse with.
				{:else}
					Select the files to add to your knowledge library.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		{#if step === 'source'}
			<div class="min-h-32 min-w-0 space-y-4">
				{#if providersLoading}
					<div class="flex flex-col items-center gap-2 py-8">
						<div
							class="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
						></div>
						<p class="text-sm text-muted-foreground">Loading providers…</p>
					</div>
				{:else if providersError}
					<div class="flex flex-col items-center gap-2 py-8">
						<p class="text-sm text-muted-foreground">Could not load cloud providers.</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onclick={() => {
								providers = null;
								void fetchProvidersIfNeeded();
							}}
						>
							Retry
						</Button>
					</div>
				{:else if providers}
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
						{#each providers as provider (provider.id)}
							<button
								type="button"
								class="flex flex-col items-center gap-2 rounded-md border border-border px-3 py-4 transition-colors hover:bg-muted/50 {selectedProviderId ===
								provider.id
									? 'border-primary bg-primary/5'
									: ''}"
								onclick={() => selectProvider(provider.id)}
							>
								{#if provider.icon}
									<img src={provider.icon} alt={provider.displayName} class="size-8" />
								{/if}
								<span class="text-sm font-medium text-foreground">{provider.displayName}</span>
							</button>
						{/each}
					</div>

					{#if selectedProvider}
						{#if selectedProvider.credentials.length === 0}
							<div
								class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
							>
								No compatible credential found for {selectedProvider.displayName}. Create one of
								type
								<span class="font-medium"
									>{selectedProvider.compatibleCredentialTypes.join(' or ')}</span
								>
								on the
								<a href="/app/credentials" class="underline underline-offset-2">Credentials</a> page first.
							</div>
						{:else}
							<div class="space-y-1.5">
								<Label>Credential</Label>
								<Select.Root type="single" bind:value={selectedCredentialId}>
									<Select.Trigger class="w-full">
										{credentialTriggerLabel}
									</Select.Trigger>
									<Select.Content>
										{#each selectedProvider.credentials as credential (credential.id)}
											<Select.Item value={credential.id}>{credential.name}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
						{/if}
					{/if}
				{/if}
			</div>

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button
					type="button"
					disabled={!selectedProviderId || !selectedCredentialId}
					onclick={startBrowsing}
				>
					Browse files
				</Button>
			</Dialog.Footer>
		{:else}
			<div class="min-w-0 space-y-3">
				<!-- Folder breadcrumb + search -->
				<div class="flex items-center justify-between gap-3">
					<div class="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
						<button
							type="button"
							class="shrink-0 hover:text-foreground hover:underline"
							onclick={() => navigateToDepth(0)}
						>
							{selectedProvider?.displayName ?? 'Root'}
						</button>
						{#each folderStack as folder, i (folder.id)}
							<ChevronRightIcon class="size-3 shrink-0" />
							<button
								type="button"
								class="min-w-0 truncate hover:text-foreground hover:underline"
								onclick={() => navigateToDepth(i + 1)}
							>
								{folder.name}
							</button>
						{/each}
					</div>
					<Input
						type="text"
						placeholder="Search…"
						class="h-8 w-44 shrink-0 text-xs"
						bind:value={searchQuery}
						oninput={onSearchInput}
					/>
				</div>

				<!-- File list -->
				<div
					class="max-h-80 space-y-1 overflow-x-hidden overflow-y-auto rounded-md border border-border p-1.5"
				>
					{#if browseLoading && entries.length === 0}
						<div class="flex flex-col items-center gap-2 py-8">
							<div
								class="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
							></div>
							<p class="text-sm text-muted-foreground">Loading files…</p>
						</div>
					{:else if browseError}
						<div class="flex flex-col items-center gap-2 py-8">
							<p class="px-4 text-center text-sm text-muted-foreground">Could not load files.</p>
							<Button type="button" variant="outline" size="sm" onclick={() => void browse()}>
								Retry
							</Button>
						</div>
					{:else if entries.length === 0}
						<p class="py-8 text-center text-sm text-muted-foreground">No files found.</p>
					{:else}
						{#each entries as entry (entry.externalId)}
							{#if entry.kind === 'folder'}
								<button
									type="button"
									class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
									onclick={() => openFolder(entry)}
								>
									<FolderIcon class="size-4 shrink-0 text-muted-foreground" />
									<span class="min-w-0 flex-1 truncate text-sm text-foreground">{entry.name}</span>
									<ChevronRightIcon class="size-3.5 shrink-0 text-muted-foreground" />
								</button>
							{:else}
								{@const importable = isImportable(entry)}
								{@const checked = selectedFiles.has(entry.externalId)}
								<label
									class="flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors {importable
										? 'cursor-pointer hover:bg-muted/50'
										: 'opacity-50'} {checked ? 'bg-primary/5' : ''}"
								>
									<input
										type="checkbox"
										{checked}
										disabled={!importable}
										onchange={() => toggleFile(entry)}
										class="size-4 rounded border-border accent-primary"
									/>
									<FileIcon class="size-4 shrink-0 text-muted-foreground" />
									<span class="min-w-0 flex-1 truncate text-sm text-foreground" title={entry.name}>
										{entry.name}
									</span>
									{#if !importable}
										<span class="shrink-0 text-xs text-muted-foreground">unsupported</span>
									{/if}
								</label>
							{/if}
						{/each}
						{#if nextPageToken}
							<div class="flex justify-center py-1.5">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={browseLoading}
									onclick={() => void browse({ append: true })}
								>
									{browseLoading ? 'Loading…' : 'Load more'}
								</Button>
							</div>
						{/if}
					{/if}
				</div>
			</div>

			<Dialog.Footer class="sm:justify-between">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					class="gap-1"
					onclick={() => (step = 'source')}
				>
					<ChevronLeftIcon class="size-3.5" />
					Back
				</Button>
				<div class="flex gap-2">
					<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
					<Button
						type="button"
						disabled={selectedFiles.size === 0 || importing}
						onclick={confirmImport}
					>
						{importing
							? 'Importing…'
							: `Import ${selectedFiles.size > 0 ? selectedFiles.size : ''} file${selectedFiles.size === 1 ? '' : 's'}`}
					</Button>
				</div>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>

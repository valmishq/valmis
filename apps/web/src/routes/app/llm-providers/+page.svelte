<script lang="ts">
	import { tick } from 'svelte';
	import { api } from '$lib/api.client.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import { cn } from '$lib/utils.js';
	import { authStore } from '$lib/stores/auth.store.js';
	import { get } from 'svelte/store';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import StarIcon from '@lucide/svelte/icons/star';
	import BotIcon from '@lucide/svelte/icons/bot';
	import BrainCircuitIcon from '@lucide/svelte/icons/brain-circuit';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import type { PageData } from './$types';
	import type { LlmProviderConfig, LlmCatalogProvider, LlmCatalogModel } from '@repo/types';

	let { data }: { data: PageData } = $props();

	// Mutable local list — synced from SSR data and updated by client-side mutations
	let configs = $state<LlmProviderConfig[]>([]);
	$effect(() => {
		configs = data.configs;
	});

	// ── Provider catalog ──────────────────────────────────────────────────────
	// Catalog providers (from server) plus a trailing "Custom / Self-hosted" entry
	const CUSTOM_PROVIDER: LlmCatalogProvider = {
		id: 'custom',
		label: 'Custom / Self-hosted',
		url: '',
		requiresBaseUrl: true,
		modelPlaceholder: 'e.g. llama3'
	};
	const ALL_PROVIDERS: LlmCatalogProvider[] = [...data.llmProviders, CUSTOM_PROVIDER];
	const ALL_MODELS: LlmCatalogModel[] = data.llmModels;

	// ── Add config dialog ──────────────────────────────────────────────────────
	let addDialogOpen = $state(false);
	let editingConfig = $state<LlmProviderConfig | null>(null);

	// Form fields
	let formProvider = $state('openai');
	let formName = $state('');
	let formModel = $state('');
	let formApiKey = $state('');
	let formBaseUrl = $state('');
	let formIsDefault = $state(false);
	let formIsEmbeddingModel = $state(false);
	let isSaving = $state(false);
	let saveError = $state('');

	let selectedPreset = $derived(
		ALL_PROVIDERS.find((p) => p.id === formProvider) ?? ALL_PROVIDERS[0]
	);

	/** Catalog models available for the currently selected provider + embedding toggle */
	const catalogModels = $derived(
		ALL_MODELS.filter(
			(m) => m.providerId === formProvider && m.isEmbeddingModel === formIsEmbeddingModel
		)
	);

	// ── Provider combobox state ────────────────────────────────────────────────
	let providerPopoverOpen = $state(false);
	let providerTriggerRef = $state<HTMLButtonElement>(null!);

	// ── Model combobox state ───────────────────────────────────────────────────
	let modelPopoverOpen = $state(false);
	let modelTriggerRef = $state<HTMLButtonElement>(null!);

	/** Display label for the model combobox trigger */
	const modelTriggerLabel = $derived(
		formModel
			? (catalogModels.find((m) => m.id === formModel)?.name ?? formModel)
			: (selectedPreset?.modelPlaceholder ?? 'Select or type a model…')
	);

	function selectProvider(id: string) {
		formProvider = id;
		providerPopoverOpen = false;
		tick().then(() => providerTriggerRef?.focus());
		handleProviderChange();
	}

	function selectCatalogModel(id: string) {
		formModel = id;
		modelPopoverOpen = false;
		tick().then(() => modelTriggerRef?.focus());
	}

	function openAddDialog() {
		editingConfig = null;
		formProvider = 'openai';
		formName = '';
		// Pre-select the first available chat model for OpenAI
		const firstOpenAiModel = ALL_MODELS.find(
			(m) => m.providerId === 'openai' && !m.isEmbeddingModel
		);
		formModel = firstOpenAiModel?.id ?? '';
		formApiKey = '';
		formBaseUrl = '';
		formIsDefault = configs.length === 0; // auto-default when first
		formIsEmbeddingModel = false;
		saveError = '';
		addDialogOpen = true;
	}

	function openEditDialog(config: LlmProviderConfig) {
		editingConfig = config;
		formProvider = config.provider;
		formName = config.name;
		formModel = config.model;
		formApiKey = ''; // never pre-fill secrets
		formBaseUrl = '';
		formIsDefault = config.isDefault;
		formIsEmbeddingModel = config.isEmbeddingModel;
		saveError = '';
		addDialogOpen = true;
	}

	/**
	 * When provider changes, reset formModel to the first catalog model for that
	 * provider (respecting the current embedding toggle), or clear it for custom.
	 */
	function handleProviderChange() {
		if (editingConfig) return;
		const first = ALL_MODELS.find(
			(m) => m.providerId === formProvider && m.isEmbeddingModel === formIsEmbeddingModel
		);
		formModel = first?.id ?? '';
	}

	function closeAddDialog() {
		addDialogOpen = false;
		editingConfig = null;
		saveError = '';
	}

	async function handleSave(e: SubmitEvent) {
		e.preventDefault();
		isSaving = true;
		saveError = '';

		const { user } = get(authStore);
		if (!user) {
			saveError = 'Not authenticated';
			isSaving = false;
			return;
		}

		try {
			if (editingConfig) {
				// Update existing config
				const body: Record<string, unknown> = {
					ownerId: user.id,
					name: formName,
					model: formModel,
					isDefault: formIsDefault,
					isEmbeddingModel: formIsEmbeddingModel
				};
				// Only include data when the user actually typed a key
				if (formApiKey.trim() !== '') {
					body.data = {
						apiKey: formApiKey,
						...(formBaseUrl.trim() ? { baseUrl: formBaseUrl.trim() } : {})
					};
				}

				const res = await api(`/llm-providers/${editingConfig.id}`, {
					method: 'PUT',
					body: JSON.stringify(body)
				});

				if (!res.ok) {
					const resBody = await res.json();
					saveError = resBody.error ?? 'Failed to update configuration';
					return;
				}
			} else {
				// Create new config
				if (!formApiKey.trim()) {
					saveError = 'API key is required';
					return;
				}

				const body: Record<string, unknown> = {
					ownerId: user.id,
					provider: formProvider,
					name: formName,
					model: formModel,
					isDefault: formIsDefault,
					isEmbeddingModel: formIsEmbeddingModel,
					data: {
						apiKey: formApiKey.trim(),
						...(formBaseUrl.trim() ? { baseUrl: formBaseUrl.trim() } : {})
					}
				};

				const res = await api('/llm-providers', {
					method: 'POST',
					body: JSON.stringify(body)
				});

				if (!res.ok) {
					const resBody = await res.json();
					saveError = resBody.error ?? 'Failed to create configuration';
					return;
				}
			}

			closeAddDialog();
			await refreshConfigs();
		} catch {
			saveError = 'An unexpected error occurred';
		} finally {
			isSaving = false;
		}
	}

	// ── Set default ────────────────────────────────────────────────────────────
	let settingDefault = $state<string | null>(null);

	async function handleSetDefault(config: LlmProviderConfig) {
		const { user } = get(authStore);
		if (!user) return;

		settingDefault = config.id;
		try {
			const res = await api(`/llm-providers/${config.id}/set-default`, {
				method: 'POST',
				body: JSON.stringify({ ownerId: user.id })
			});
			if (res.ok) {
				await refreshConfigs();
			}
		} catch {
			// silently ignore
		} finally {
			settingDefault = null;
		}
	}

	// ── Delete dialog ─────────────────────────────────────────────────────────
	let deleteDialogOpen = $state(false);
	let configToDelete = $state<LlmProviderConfig | null>(null);
	let isDeleting = $state(false);

	function requestDelete(config: LlmProviderConfig) {
		configToDelete = config;
		deleteDialogOpen = true;
	}

	async function confirmDelete() {
		if (!configToDelete) return;
		isDeleting = true;

		const { user } = get(authStore);
		if (!user) {
			isDeleting = false;
			return;
		}

		try {
			const res = await api(`/llm-providers/${configToDelete.id}`, {
				method: 'DELETE',
				body: JSON.stringify({ ownerId: user.id })
			});
			if (res.ok) {
				configs = configs.filter((c) => c.id !== configToDelete!.id);
			}
		} catch {
			// silently ignore
		} finally {
			isDeleting = false;
			deleteDialogOpen = false;
			configToDelete = null;
		}
	}

	// ── Helpers ────────────────────────────────────────────────────────────────
	async function refreshConfigs() {
		const { user } = get(authStore);
		if (!user) return;
		try {
			const res = await api(`/llm-providers?ownerId=${encodeURIComponent(user.id)}`);
			if (res.ok) {
				const body = await res.json();
				configs = (body.data ?? []) as LlmProviderConfig[];
			}
		} catch {
			// silently ignore
		}
	}

	function providerLabel(provider: string): string {
		return ALL_PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
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
	<title>LLM Providers — OpenAgent Dashboard</title>
	<meta
		name="description"
		content="Configure AI language model providers for your OpenAgent integrations. Connect OpenAI, Anthropic, Google Gemini, and more."
	/>
	<meta
		name="keywords"
		content="LLM, AI providers, OpenAI, Anthropic, Gemini, language models, OpenAgent"
	/>
</svelte:head>

<!-- ── Delete confirmation dialog ───────────────────────────────────────── -->
<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete configuration</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to delete <span class="font-medium text-foreground"
					>{configToDelete?.name}</span
				>? Any agents using this configuration will fall back to the default.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="gap-2 sm:gap-0">
			<Button
				variant="outline"
				onclick={() => {
					deleteDialogOpen = false;
					configToDelete = null;
				}}
				disabled={isDeleting}
			>
				Cancel
			</Button>
			<Button variant="destructive" onclick={confirmDelete} disabled={isDeleting}>
				{isDeleting ? 'Deleting…' : 'Delete'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- ── Add / Edit config dialog ─────────────────────────────────────────── -->
<Dialog.Root
	bind:open={addDialogOpen}
	onOpenChange={(open: boolean) => {
		if (!open) closeAddDialog();
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{editingConfig ? 'Edit configuration' : 'Add LLM provider'}</Dialog.Title>
			<Dialog.Description>
				{#if editingConfig}
					Update the name, model, or API key for this configuration.
				{:else}
					Connect an AI language model provider to power your integrations.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={handleSave} class="space-y-4">
			{#if saveError}
				<p class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
					{saveError}
				</p>
			{/if}

			<!-- Provider combobox (only shown when creating) -->
			{#if !editingConfig}
				<div class="space-y-1.5">
					<Label for="provider">Provider</Label>
					<Popover.Root bind:open={providerPopoverOpen}>
						<Popover.Trigger bind:ref={providerTriggerRef}>
							{#snippet child({ props }: { props: Record<string, unknown> })}
								<Button
									{...props}
									id="provider"
									variant="outline"
									role="combobox"
									aria-expanded={providerPopoverOpen}
									class="w-full justify-between font-normal"
								>
									{selectedPreset?.label ?? 'Select provider…'}
									<ChevronsUpDownIcon class="ml-2 size-4 shrink-0 opacity-50" />
								</Button>
							{/snippet}
						</Popover.Trigger>
						<Popover.Content class="w-max p-0" align="start">
							<Command.Root>
								<Command.Input placeholder="Search providers…" />
								<Command.List>
									<Command.Empty>No provider found.</Command.Empty>
									<Command.Group>
										{#each ALL_PROVIDERS as preset (preset.id)}
											<Command.Item value={preset.id} onSelect={() => selectProvider(preset.id)}>
												<CheckIcon
													class={cn(
														'mr-2 size-4',
														formProvider !== preset.id && 'text-transparent'
													)}
												/>
												{preset.label}
											</Command.Item>
										{/each}
									</Command.Group>
								</Command.List>
							</Command.Root>
						</Popover.Content>
					</Popover.Root>
				</div>
			{/if}

			<!-- Config name -->
			<div class="space-y-1.5">
				<Label for="configName">Name</Label>
				<Input
					id="configName"
					type="text"
					bind:value={formName}
					required
					placeholder="e.g. GPT-4o production key"
				/>
				<p class="text-xs text-muted-foreground">A label to identify this configuration.</p>
			</div>

			<!-- Model — combobox picker when catalog models exist, otherwise plain text input -->
			<div class="space-y-1.5">
				<Label for="model">Model</Label>
				{#if catalogModels.length > 0}
					<Popover.Root bind:open={modelPopoverOpen}>
						<Popover.Trigger bind:ref={modelTriggerRef}>
							{#snippet child({ props }: { props: Record<string, unknown> })}
								<Button
									{...props}
									id="model"
									variant="outline"
									role="combobox"
									aria-expanded={modelPopoverOpen}
									class="w-full justify-between font-normal"
								>
									<span class="truncate">{modelTriggerLabel}</span>
									<ChevronsUpDownIcon class="ml-2 size-4 shrink-0 opacity-50" />
								</Button>
							{/snippet}
						</Popover.Trigger>
						<Popover.Content class="w-[var(--bits-popover-anchor-width)] p-0" align="start">
							<Command.Root>
								<Command.Input placeholder="Search models…" />
								<Command.List class="max-h-60">
									<Command.Empty>No model found.</Command.Empty>
									<Command.Group>
										{#each catalogModels as m (m.id)}
											<Command.Item value={m.id} onSelect={() => selectCatalogModel(m.id)}>
												<CheckIcon
													class={cn(
														'mr-2 size-4 shrink-0',
														formModel !== m.id && 'text-transparent'
													)}
												/>
												<span class="flex-1 truncate">{m.name}</span>
												{#if m.contextLength}
													<span class="ml-2 shrink-0 text-xs text-muted-foreground">
														{Math.round(m.contextLength / 1000)}k ctx
													</span>
												{/if}
											</Command.Item>
										{/each}
									</Command.Group>
								</Command.List>
							</Command.Root>
						</Popover.Content>
					</Popover.Root>
					<!-- Always allow manual override -->
					<Input
						type="text"
						bind:value={formModel}
						required
						placeholder={selectedPreset?.modelPlaceholder ?? 'or type a model ID…'}
						class="mt-1.5"
					/>
					<p class="text-xs text-muted-foreground">
						Pick from the list above or type a model ID directly.
					</p>
				{:else}
					<Input
						id="model"
						type="text"
						bind:value={formModel}
						required
						placeholder={selectedPreset?.modelPlaceholder ?? 'Model identifier'}
					/>
				{/if}
			</div>

			<!-- API key -->
			<div class="space-y-1.5">
				<Label for="apiKey">
					API key{editingConfig ? ' (leave blank to keep current)' : ''}
				</Label>
				<Input
					id="apiKey"
					type="password"
					bind:value={formApiKey}
					required={!editingConfig}
					placeholder={editingConfig ? '••••••••  (unchanged)' : 'sk-…'}
					autocomplete="off"
				/>
			</div>

			<!-- Base URL — always shown for 'custom' (requiresBaseUrl), optional for others -->
			{#if selectedPreset?.requiresBaseUrl || editingConfig?.provider === 'custom'}
				<div class="space-y-1.5">
					<Label for="baseUrl">Base URL</Label>
					<Input
						id="baseUrl"
						type="url"
						bind:value={formBaseUrl}
						required={selectedPreset?.requiresBaseUrl && !editingConfig}
						placeholder="https://your-endpoint/v1"
					/>
					<p class="text-xs text-muted-foreground">
						The base URL of your OpenAI-compatible endpoint.
					</p>
				</div>
			{/if}

			<!-- Embedding model toggle -->
			<div class="flex items-center gap-2.5">
				<input
					id="isEmbeddingModel"
					type="checkbox"
					bind:checked={formIsEmbeddingModel}
					onchange={handleProviderChange}
					class="size-4 rounded border-border accent-primary"
				/>
				<Label for="isEmbeddingModel" class="cursor-pointer font-normal">
					This is an embedding model
				</Label>
			</div>
			{#if formIsEmbeddingModel}
				<p class="text-xs text-muted-foreground">
					Embedding models generate vector representations for agent memory search — they cannot be
					used for chat or completion.
				</p>
			{/if}

			<!-- Set as default toggle — only meaningful for chat models -->
			{#if !formIsEmbeddingModel}
				<div class="flex items-center gap-2.5">
					<input
						id="isDefault"
						type="checkbox"
						bind:checked={formIsDefault}
						class="size-4 rounded border-border accent-primary"
					/>
					<Label for="isDefault" class="cursor-pointer font-normal">
						Set as default for this account
					</Label>
				</div>
			{/if}

			<Dialog.Footer class="pt-2">
				<Button type="button" variant="outline" onclick={closeAddDialog} disabled={isSaving}>
					Cancel
				</Button>
				<Button type="submit" disabled={isSaving}>
					{isSaving ? 'Saving…' : editingConfig ? 'Save changes' : 'Add provider'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- ── Page ─────────────────────────────────────────────────────────────── -->
<PageHeader
	title="LLM Providers"
	description="Configure language model providers used by your agents and integrations."
>
	{#snippet actions()}
		<Button onclick={openAddDialog} class="gap-2">
			<PlusIcon class="size-4" />
			Add provider
		</Button>
	{/snippet}
</PageHeader>

<!-- Provider config list -->
<Card.Root>
	<Card.Header class="pb-3">
		<Card.Title class="text-sm font-medium">Configured providers</Card.Title>
		<Card.Description class="text-xs">
			{configs.length} provider{configs.length !== 1 ? 's' : ''} configured
		</Card.Description>
	</Card.Header>

	{#if configs.length === 0}
		<Card.Content>
			<div class="flex flex-col items-center gap-3 py-10">
				<div
					class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
				>
					<BotIcon class="size-5" />
				</div>
				<div class="text-center">
					<p class="text-sm font-medium text-foreground">No providers configured</p>
					<p class="mt-0.5 text-xs text-muted-foreground">
						Add an LLM provider to let your agents generate responses.
					</p>
				</div>
				<Button variant="outline" size="sm" onclick={openAddDialog} class="gap-2">
					<PlusIcon class="size-4" />
					Add your first provider
				</Button>
			</div>
		</Card.Content>
	{:else}
		<Card.Content class="p-0">
			<ul class="divide-y divide-border">
				{#each configs as config (config.id)}
					<li class="flex items-start justify-between gap-4 px-6 py-4">
						<!-- Left: identity -->
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<p class="truncate text-sm font-medium text-foreground">{config.name}</p>
								{#if config.isEmbeddingModel}
									<Badge variant="secondary" class="shrink-0 gap-1 text-xs">
										<BrainCircuitIcon class="size-3" />
										Embedding
									</Badge>
								{:else if config.isDefault}
									<Badge class="shrink-0 gap-1 text-xs">
										<StarIcon class="size-3" />
										Default
									</Badge>
								{/if}
								<Badge variant="secondary" class="shrink-0 text-xs">
									{providerLabel(config.provider)}
								</Badge>
							</div>
							<p class="mt-0.5 font-mono text-xs text-muted-foreground">
								{config.model}
								<span class="font-sans"> · added {formatDate(config.createdAt)}</span>
							</p>
						</div>

						<!-- Right: actions -->
						<div class="flex shrink-0 items-center gap-1">
							{#if !config.isDefault && !config.isEmbeddingModel}
								<Button
									variant="ghost"
									size="sm"
									onclick={() => handleSetDefault(config)}
									disabled={settingDefault === config.id}
									class="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
									title="Set as default"
								>
									<StarIcon class="size-3.5" />
									Set default
								</Button>
							{/if}

							<Button
								variant="ghost"
								size="sm"
								onclick={() => openEditDialog(config)}
								class="text-muted-foreground hover:text-foreground"
								title="Edit configuration"
							>
								<PencilIcon class="size-4" />
								<span class="sr-only">Edit {config.name}</span>
							</Button>

							<Button
								variant="ghost"
								size="sm"
								onclick={() => requestDelete(config)}
								class="text-destructive hover:bg-destructive/10 hover:text-destructive"
								title="Delete configuration"
							>
								<TrashIcon class="size-4" />
								<span class="sr-only">Delete {config.name}</span>
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		</Card.Content>
	{/if}
</Card.Root>

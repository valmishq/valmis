<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api.client.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import { authStore } from '$lib/stores/auth.store.js';
	import { get } from 'svelte/store';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import type { PageData } from './$types';
	import type { CredentialMetadata, CredentialDefinition, LlmProviderConfig } from '@repo/types';
	import { EMOJI_PRESETS } from '$lib/components/custom/agent-emojis.js';

	let { data }: { data: PageData } = $props();

	let credentials = $state<CredentialMetadata[]>([]);
	let definitions = $state<CredentialDefinition[]>([]);
	let llmConfigs = $state<LlmProviderConfig[]>([]);
	$effect(() => {
		credentials = data.credentials;
		definitions = data.definitions;
		llmConfigs = data.llmConfigs;
	});

	/** Chat/completion models only */
	const chatModels = $derived(llmConfigs.filter((c) => !c.isEmbeddingModel));
	/** Embedding models only */
	const embeddingModels = $derived(llmConfigs.filter((c) => c.isEmbeddingModel));

	// ── Form state ────────────────────────────────────────────────────────────
	let name = $state('');
	let description = $state('');
	let systemInstruction = $state('');
	let avatarEmoji = $state('🤖');
	let emojiPickerOpen = $state(false);
	let selectedCredentialIds = $state<Set<string>>(new Set());
	/** Default to the first available chat/embedding model once data loads */
	let selectedModelConfigId = $state<string>('');
	let selectedEmbeddingModelConfigId = $state<string>('');
	$effect(() => {
		if (!selectedModelConfigId && chatModels.length > 0) {
			selectedModelConfigId = chatModels[0].id;
		}
		if (!selectedEmbeddingModelConfigId && embeddingModels.length > 0) {
			selectedEmbeddingModelConfigId = embeddingModels[0].id;
		}
	});

	/** Derived trigger labels for the shadcn Select components */
	const chatModelTriggerLabel = $derived(
		chatModels.find((c) => c.id === selectedModelConfigId)
			? `${chatModels.find((c) => c.id === selectedModelConfigId)!.name} (${chatModels.find((c) => c.id === selectedModelConfigId)!.model})`
			: 'Select a chat model'
	);
	const embeddingModelTriggerLabel = $derived(
		embeddingModels.find((c) => c.id === selectedEmbeddingModelConfigId)
			? `${embeddingModels.find((c) => c.id === selectedEmbeddingModelConfigId)!.name} (${embeddingModels.find((c) => c.id === selectedEmbeddingModelConfigId)!.model})`
			: 'Select an embedding model'
	);
	let isSaving = $state(false);

	function selectEmoji(emoji: string) {
		avatarEmoji = emoji;
		emojiPickerOpen = false;
	}

	function toggleCredential(id: string) {
		const next = new Set(selectedCredentialIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedCredentialIds = next;
	}

	/** Get the icon URL for a credential type from definitions */
	function getCredentialIcon(type: string): string | null {
		return definitions.find((d) => d.id === type)?.icon ?? null;
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		isSaving = true;

		const { user } = get(authStore);
		if (!user) {
			setAlert({
				type: 'error',
				title: 'Not authenticated',
				message: 'You must be signed in to create an agent.',
				duration: 5000,
				show: true
			});
			isSaving = false;
			return;
		}

		try {
			const res = await api('/agents', {
				method: 'POST',
				body: JSON.stringify({
					ownerId: user.id,
					name,
					description: description || undefined,
					systemInstruction: systemInstruction || undefined,
					avatarUrl: avatarEmoji,
					credentialIds: [...selectedCredentialIds],
					modelConfigId: selectedModelConfigId || undefined,
					embeddingModelConfigId: selectedEmbeddingModelConfigId || undefined
				})
			});

			if (!res.ok) {
				const body = await res.json();
				setAlert({
					type: 'error',
					title: 'Failed to create agent',
					message: body.error ?? 'An unexpected error occurred.',
					duration: 5000,
					show: true
				});
				return;
			}

			setAlert({
				type: 'success',
				title: 'Agent created',
				message: `"${name}" has been created successfully.`,
				duration: 5000,
				show: true
			});
			goto('/app/agents');
		} catch {
			setAlert({
				type: 'error',
				title: 'Failed to create agent',
				message: 'An unexpected error occurred.',
				duration: 5000,
				show: true
			});
		} finally {
			isSaving = false;
		}
	}
</script>

<svelte:head>
	<title>New Agent — OpenAgent Dashboard</title>
	<meta
		name="description"
		content="Create a new AI agent with custom instructions, personality, and access to your service credentials."
	/>
	<meta name="keywords" content="create agent, new AI agent, custom persona, OpenAgent" />
</svelte:head>

<PageHeader
	title="New Agent"
	description="Configure a new AI agent with its own persona and capabilities."
>
	{#snippet actions()}
		<Button variant="outline" onclick={() => goto('/app/agents')} class="gap-2">
			<ChevronLeftIcon class="size-4" />
			Back to agents
		</Button>
	{/snippet}
</PageHeader>

<form onsubmit={handleSubmit} class="space-y-6">
	<!-- ── Identity Section ────────────────────────────────────────────────── -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">Identity</Card.Title>
			<Card.Description class="text-xs">Give your agent a name and personality.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<!-- Avatar emoji picker — click the avatar tile to open the picker -->
			<div class="space-y-1.5">
				<Label>Avatar</Label>
				<Popover.Root bind:open={emojiPickerOpen}>
					<Popover.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="flex size-12 cursor-pointer items-center justify-center rounded-xl border border-border bg-muted text-2xl transition-colors hover:bg-muted/70"
								title="Click to change emoji"
							>
								{avatarEmoji}
							</button>
						{/snippet}
					</Popover.Trigger>
					<Popover.Content class="w-72 p-3" align="start">
						<p class="mb-2 text-xs font-medium text-muted-foreground">Select an emoji</p>
						<div class="grid grid-cols-8 gap-1">
							{#each EMOJI_PRESETS as emoji (emoji)}
								<button
									type="button"
									onclick={() => selectEmoji(emoji)}
									class="flex size-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-muted {avatarEmoji ===
									emoji
										? 'bg-primary/10 ring-1 ring-primary'
										: ''}"
								>
									{emoji}
								</button>
							{/each}
						</div>
					</Popover.Content>
				</Popover.Root>
				<p class="text-xs text-muted-foreground">Click the avatar to choose an emoji.</p>
			</div>

			<!-- Name -->
			<div class="space-y-1.5">
				<Label for="agent-name">Name</Label>
				<Input
					id="agent-name"
					type="text"
					bind:value={name}
					required
					placeholder="e.g. Research Assistant"
				/>
			</div>

			<!-- Description -->
			<div class="space-y-1.5">
				<Label for="agent-description">Description (optional)</Label>
				<Input
					id="agent-description"
					type="text"
					bind:value={description}
					placeholder="A brief description of what this agent does"
				/>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- ── System Instruction Section ──────────────────────────────────────── -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">System Instruction</Card.Title>
			<Card.Description class="text-xs">
				Define the agent's behavior, personality, and constraints.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="space-y-1.5">
				<Label for="system-instruction">Instruction</Label>
				<textarea
					id="system-instruction"
					bind:value={systemInstruction}
					placeholder="You are a helpful assistant that..."
					rows={6}
					class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				></textarea>
				<p class="text-xs text-muted-foreground">
					This instruction is sent as the system message every time the agent responds.
				</p>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- ── Model Section ────────────────────────────────────────────────────── -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">Models</Card.Title>
			<Card.Description class="text-xs">
				Select the chat model and embedding model this agent uses. Configure models in
				<a href="/app/llm-providers" class="underline underline-offset-2 hover:text-foreground"
					>LLM Providers</a
				>.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<!-- Chat model -->
			<div class="space-y-1.5">
				<Label for="model-config">Chat model</Label>
				{#if chatModels.length === 0}
					<p class="text-sm text-muted-foreground">
						No chat models configured. Add one in
						<a href="/app/llm-providers" class="underline underline-offset-2 hover:text-foreground"
							>LLM Providers</a
						>.
					</p>
				{:else}
					<Select.Root type="single" name="modelConfigId" bind:value={selectedModelConfigId}>
						<Select.Trigger class="w-full">
							{chatModelTriggerLabel}
						</Select.Trigger>
						<Select.Content>
							{#each chatModels as cfg (cfg.id)}
								<Select.Item value={cfg.id} label="{cfg.name} ({cfg.model})">
									{cfg.name} ({cfg.model})
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<p class="text-xs text-muted-foreground">Used for chat and completion at runtime.</p>
				{/if}
			</div>

			<!-- Embedding model -->
			<div class="space-y-1.5">
				<Label for="embedding-model-config">Embedding model</Label>
				{#if embeddingModels.length === 0}
					<p class="text-sm text-muted-foreground">
						No embedding models configured. Add one (mark as embedding model) in
						<a href="/app/llm-providers" class="underline underline-offset-2 hover:text-foreground"
							>LLM Providers</a
						>.
					</p>
				{:else}
					<Select.Root
						type="single"
						name="embeddingModelConfigId"
						bind:value={selectedEmbeddingModelConfigId}
					>
						<Select.Trigger class="w-full">
							{embeddingModelTriggerLabel}
						</Select.Trigger>
						<Select.Content>
							{#each embeddingModels as cfg (cfg.id)}
								<Select.Item value={cfg.id} label="{cfg.name} ({cfg.model})">
									{cfg.name} ({cfg.model})
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<p class="text-xs text-muted-foreground">
						Used to generate vector embeddings for memory. Changing this model will require clearing
						existing memory.
					</p>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>

	<!-- ── Credentials Section ─────────────────────────────────────────────── -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">Credentials</Card.Title>
			<Card.Description class="text-xs">
				Select which credentials this agent can access. Only selected credentials will be available
				to the agent at runtime.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if credentials.length === 0}
				<p class="py-4 text-center text-sm text-muted-foreground">
					No credentials configured yet.
					<a href="/app/credentials" class="underline underline-offset-2 hover:text-foreground">
						Add credentials
					</a>
					first.
				</p>
			{:else}
				<div class="space-y-2">
					{#each credentials as cred (cred.id)}
						{@const icon = getCredentialIcon(cred.type)}
						<label
							class="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 transition-colors hover:bg-muted/50 {selectedCredentialIds.has(
								cred.id
							)
								? 'border-primary bg-primary/5'
								: ''}"
						>
							<input
								type="checkbox"
								checked={selectedCredentialIds.has(cred.id)}
								onchange={() => toggleCredential(cred.id)}
								class="size-4 rounded border-border accent-primary"
							/>
							<!-- Credential service icon or fallback -->
							<div
								class="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground"
							>
								{#if icon}
									<img src={icon} alt={cred.type} class="size-4 object-contain" />
								{:else}
									<ShieldIcon class="size-3.5" />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-foreground">{cred.name}</p>
								<p class="text-xs text-muted-foreground">{cred.type}</p>
							</div>
						</label>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- ── Knowledge Base Section (stub) ───────────────────────────────────── -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">Knowledge Base</Card.Title>
			<Card.Description class="text-xs">
				Upload files or connect external sources for the agent to reference.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<p class="py-4 text-center text-sm text-muted-foreground">Coming soon</p>
		</Card.Content>
	</Card.Root>

	<!-- ── Skills Section (stub) ───────────────────────────────────────────── -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">Skills</Card.Title>
			<Card.Description class="text-xs">
				Enable specific capabilities for this agent.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<p class="py-4 text-center text-sm text-muted-foreground">Coming soon</p>
		</Card.Content>
	</Card.Root>

	<!-- ── Submit ──────────────────────────────────────────────────────────── -->
	<Separator />
	<div class="flex justify-end gap-3">
		<Button type="button" variant="outline" onclick={() => goto('/app/agents')} disabled={isSaving}>
			Cancel
		</Button>
		<Button type="submit" disabled={isSaving || !name}>
			{isSaving ? 'Creating…' : 'Create agent'}
		</Button>
	</div>
</form>

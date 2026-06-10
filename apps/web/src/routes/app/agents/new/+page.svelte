<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import AgentSkillsPanel from '$lib/components/custom/agent-skills-panel.svelte';
	import AgentCredentialsPanel from '$lib/components/custom/agent-credentials-panel.svelte';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import BrainIcon from '@lucide/svelte/icons/brain';
	import type { PageData, ActionData } from './$types';
	import type {
		CredentialMetadata,
		CredentialDefinition,
		LlmProviderConfig,
		AgentEvolvedSkill
	} from '@repo/types';
	import { EMOJI_PRESETS } from '$lib/components/custom/agent-emojis.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const isEditMode = $derived(data.isEditMode);
	const agent = $derived(data.agent);

	// ── Supporting data ───────────────────────────────────────────────────────
	let credentials = $state<CredentialMetadata[]>(data.credentials);
	let definitions = $state<CredentialDefinition[]>(data.definitions);
	let llmConfigs = $state<LlmProviderConfig[]>(data.llmConfigs);

	$effect(() => {
		credentials = data.credentials;
		definitions = data.definitions;
		llmConfigs = data.llmConfigs;
	});

	// Show success alert after redirect from form action
	$effect(() => {
		if ($page.url.searchParams.get('saved') === 'true') {
			setAlert({
				type: 'success',
				title: isEditMode ? 'Agent updated' : 'Agent created',
				message: isEditMode
					? `"${agent?.name}" has been saved.`
					: 'Your new agent has been created.',
				duration: 5000,
				show: true
			});
		}
	});

	/** Chat/completion models only */
	const chatModels = $derived(llmConfigs.filter((c) => !c.isEmbeddingModel));
	/** Embedding models only */
	const embeddingModels = $derived(llmConfigs.filter((c) => c.isEmbeddingModel));

	// ── Form state ────────────────────────────────────────────────────────────
	let name = $state(agent?.name ?? '');
	let description = $state(agent?.description ?? '');
	let systemInstruction = $state(agent?.systemInstruction ?? '');
	let avatarEmoji = $state(agent?.avatarUrl ?? '🤖');
	let emojiPickerOpen = $state(false);
	let selectedCredentialIds = $state<Set<string>>(new Set(agent?.credentialIds ?? []));
	let selectedModelConfigId = $state<string>(agent?.modelConfigId ?? '');
	let selectedEmbeddingModelConfigId = $state<string>(agent?.embeddingModelConfigId ?? '');
	/** Skill selections — same pattern as credential checkboxes */
	let selectedSkillNames = $state<Set<string>>(new Set(data.assignedSkillNames ?? []));

	// Auto-select first model on create mode when configs load
	$effect(() => {
		if (!isEditMode) {
			if (!selectedModelConfigId && chatModels.length > 0) {
				selectedModelConfigId = chatModels[0].id;
			}
			if (!selectedEmbeddingModelConfigId && embeddingModels.length > 0) {
				selectedEmbeddingModelConfigId = embeddingModels[0].id;
			}
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

	/**
	 * Evolved skills pre-loaded from server for edit mode.
	 * Keyed by skill name for O(1) lookup in the panel component.
	 * Currently empty — future: load from server via +page.server.ts.
	 */
	const evolvedSkills: Record<string, AgentEvolvedSkill> = {};
</script>

<svelte:head>
	{#if isEditMode && agent}
		<title>{agent.name} — Edit Agent — AgentInt Dashboard</title>
		<meta
			name="description"
			content="Edit the configuration of your AI agent: update instructions, credentials, and memory."
		/>
		<meta name="keywords" content="edit agent, agent settings, AI agent configuration, AgentInt" />
	{:else}
		<title>New Agent — AgentInt Dashboard</title>
		<meta
			name="description"
			content="Create a new AI agent with custom instructions, personality, and access to your service credentials."
		/>
		<meta name="keywords" content="create agent, new AI agent, custom persona, AgentInt" />
	{/if}
</svelte:head>

<PageHeader
	title={isEditMode && agent ? agent.name : 'New Agent'}
	description={isEditMode
		? 'Edit agent configuration and credentials.'
		: 'Configure a new AI agent with its own persona and capabilities.'}
>
	{#snippet actions()}
		<div class="flex items-center gap-2">
			{#if isEditMode && agent}
				<!-- Link to standalone memory management page -->
				<Button
					variant="outline"
					size="sm"
					onclick={() => goto(`/app/agents/${agent!.id}/memory`)}
					class="gap-2"
				>
					<BrainIcon class="size-4" />
					Memory
				</Button>
			{/if}
			<Button variant="outline" onclick={() => goto('/app/agents')} class="gap-2">
				<ChevronLeftIcon class="size-4" />
				Back to agents
			</Button>
		</div>
	{/snippet}
</PageHeader>

<!-- Server-side form action handles both create and edit -->
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
					title: isEditMode ? 'Failed to save changes' : 'Failed to create agent',
					message: (result.data as { error?: string })?.error ?? 'An unexpected error occurred.',
					duration: 5000,
					show: true
				});
				// Don't call update() — keep form values intact
			} else {
				await update();
			}
		};
	}}
	class="space-y-6"
>
	<!-- Hidden fields for form action -->
	{#if isEditMode && agent}
		<input type="hidden" name="agentId" value={agent.id} />
	{/if}
	<input type="hidden" name="avatarUrl" value={avatarEmoji} />
	<!-- Credential IDs: one hidden input per selected credential -->
	{#each [...selectedCredentialIds] as credId (credId)}
		<input type="hidden" name="credentialIds" value={credId} />
	{/each}
	<!-- Skill names: one hidden input per selected skill -->
	{#each [...selectedSkillNames] as skillName (skillName)}
		<input type="hidden" name="skillNames" value={skillName} />
	{/each}

	<!-- ── Identity ──────────────────────────────────────────────────────────── -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">Identity</Card.Title>
			<Card.Description class="text-xs">Give your agent a name and avatar.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<!-- Avatar emoji picker -->
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
					<Popover.Content class="w-72 p-3 md:w-96" align="start">
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
					name="name"
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
					name="description"
					type="text"
					bind:value={description}
					placeholder="A brief description of what this agent does"
				/>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- ── System Instruction ────────────────────────────────────────────────── -->
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
					name="systemInstruction"
					bind:value={systemInstruction}
					placeholder="You are a helpful assistant that..."
					rows={6}
					class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				></textarea>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- ── Models ────────────────────────────────────────────────────────────── -->
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
						<Select.Trigger class="w-full">{chatModelTriggerLabel}</Select.Trigger>
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
						<Select.Trigger class="w-full">{embeddingModelTriggerLabel}</Select.Trigger>
						<Select.Content>
							{#each embeddingModels as cfg (cfg.id)}
								<Select.Item value={cfg.id} label="{cfg.name} ({cfg.model})">
									{cfg.name} ({cfg.model})
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<p class="text-xs text-muted-foreground">
						Used to generate vector embeddings for memory. Changing this model requires clearing
						existing memory entries.
					</p>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>

	<!-- ── Credentials ───────────────────────────────────────────────────────── -->
	<AgentCredentialsPanel bind:selectedCredentialIds {credentials} {definitions} />

	<!-- ── Knowledge Base (stub) ─────────────────────────────────────────────── -->
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

	<!-- ── Skills ────────────────────────────────────────────────────────────── -->
	<!--
		Checkboxes in the component update `selectedSkillNames` (a Set).
		Hidden inputs above serialise the set into repeated `skillNames` form fields.
		The form action's two-step logic (create/update agent → diff + sync skills) does the rest.
	-->
	<AgentSkillsPanel
		bind:selectedSkillNames
		agentId={isEditMode ? agent?.id : null}
		{evolvedSkills}
	/>

	<!-- ── Submit ────────────────────────────────────────────────────────────── -->
	<Separator />
	<div class="flex justify-end gap-3">
		<Button type="button" variant="outline" onclick={() => goto('/app/agents')} disabled={isSaving}>
			Cancel
		</Button>
		<Button type="submit" disabled={isSaving || (!isEditMode && !name)}>
			{#if isSaving}
				{isEditMode ? 'Saving…' : 'Creating…'}
			{:else}
				{isEditMode ? 'Save changes' : 'Create agent'}
			{/if}
		</Button>
	</div>
</form>

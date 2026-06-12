<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { api } from '$lib/api.client.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import XIcon from '@lucide/svelte/icons/x';
	import GitBranchIcon from '@lucide/svelte/icons/git-branch';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { SkillCatalogEntry, AgentEvolvedSkill } from '@repo/types';

	interface Props {
		/** Bindable Set — parent serialises this into hidden form inputs */
		selectedSkillNames: Set<string>;
		/**
		 * agentId is only needed for the "view evolved" dialog (edit mode).
		 * Pass null/undefined in create mode.
		 */
		agentId?: string | null;
		/** Pre-loaded evolved skill data keyed by skill name (edit mode only) */
		evolvedSkills?: Record<string, AgentEvolvedSkill>;
	}

	let { selectedSkillNames = $bindable(), agentId = null, evolvedSkills = {} }: Props = $props();

	// ── Lazily-loaded catalog ─────────────────────────────────────────────────
	/** Cached after first fetch — never refetched during the same page session */
	let catalogCache = $state<SkillCatalogEntry[] | null>(null);
	let catalogLoading = $state(false);
	let catalogError = $state<string | null>(null);

	async function fetchCatalogIfNeeded() {
		if (catalogCache !== null) return; // already loaded
		catalogLoading = true;
		catalogError = null;
		try {
			const res = await api('/skills');
			if (!res.ok) throw new Error('Failed to load skills');
			const body = await res.json();
			catalogCache = (body.data ?? []) as SkillCatalogEntry[];
		} catch {
			catalogError = 'Could not load skills. Please try again.';
		} finally {
			catalogLoading = false;
		}
	}

	// ── Add-skills dialog state ───────────────────────────────────────────────
	let addDialogOpen = $state(false);
	/** Draft copy of selection — only committed on "Done" */
	let draftSkillNames = $state<Set<string>>(new Set());

	async function openAddDialog() {
		draftSkillNames = new Set(selectedSkillNames);
		addDialogOpen = true;
		await fetchCatalogIfNeeded();
	}

	function toggleDraft(name: string) {
		const next = new Set(draftSkillNames);
		if (next.has(name)) {
			next.delete(name);
		} else {
			next.add(name);
		}
		draftSkillNames = next;
	}

	function confirmSelection() {
		selectedSkillNames = new Set(draftSkillNames);
		addDialogOpen = false;
	}

	function removeSkill(name: string) {
		const next = new Set(selectedSkillNames);
		next.delete(name);
		selectedSkillNames = next;
	}

	// ── Derived: selected skills with catalog info (if catalog is loaded) ─────
	/** When catalog is available, enrich selected names with full entries */
	const selectedSkillEntries = $derived<Array<{ name: string; entry: SkillCatalogEntry | null }>>(
		[...selectedSkillNames].map((name) => ({
			name,
			entry: catalogCache?.find((s) => s.name === name) ?? null
		}))
	);

	// ── Evolved instructions dialog ───────────────────────────────────────────
	let evolvedDialogOpen = $state(false);
	let viewingSkillName = $state<string | null>(null);

	function openEvolvedDialog(name: string) {
		viewingSkillName = name;
		evolvedDialogOpen = true;
	}

	const viewingEvolved = $derived(
		viewingSkillName ? (evolvedSkills[viewingSkillName] ?? null) : null
	);

	function formatDate(iso: string | Date): string {
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<!-- ── Skills Card ─────────────────────────────────────────────────────────── -->
<Card.Root>
	<Card.Header class="flex flex-row items-start justify-between gap-4">
		<div>
			<Card.Title class="text-sm font-medium">Skills</Card.Title>
			<Card.Description class="text-xs">
				Enable pre-defined capabilities for this agent.
			</Card.Description>
		</div>
		<Button
			type="button"
			variant="outline"
			size="sm"
			class="shrink-0 gap-1.5"
			onclick={openAddDialog}
		>
			<PlusIcon class="size-3.5" />
			Add skill
		</Button>
	</Card.Header>
	<Card.Content>
		{#if selectedSkillEntries.length === 0}
			<div class="flex flex-col items-center gap-2 py-6">
				<!-- <SparklesIcon class="size-5 text-muted-foreground" /> -->
				<p class="text-sm text-muted-foreground">No skills selected.</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each selectedSkillEntries as { name, entry } (name)}
					{@const evolved = evolvedSkills[name]}
					<div class="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<p class="text-sm font-medium text-foreground">{name}</p>
								{#if entry?.source === 'installed'}
									<span
										class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
										title="Third-party skill installed from {entry.sourceRepo ?? 'GitHub'}"
									>
										<GitBranchIcon class="size-3" />
										{entry.sourceRepo ?? 'Third-party'}
									</span>
								{/if}
								{#if entry?.evolvable}
									<span
										class="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300"
										title="This skill can be self-evolved by the agent"
									>
										<SparklesIcon class="size-3" />
										Evolvable
									</span>
								{/if}
								{#if evolved}
									<span
										class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
									>
										v{evolved.version}
									</span>
								{/if}
							</div>
							{#if entry}
								<p class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{entry.description}</p>
							{/if}
						</div>
						<div class="flex shrink-0 items-center gap-1">
							{#if agentId && entry?.evolvable}
								<Button
									type="button"
									variant="ghost"
									size="sm"
									class="text-xs text-muted-foreground hover:text-foreground"
									onclick={() => openEvolvedDialog(name)}
									title="View evolved instructions"
								>
									View evolved
								</Button>
							{/if}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onclick={() => removeSkill(name)}
								class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
								title="Remove skill"
							>
								<XIcon class="size-3.5" />
							</Button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<!-- ── Add Skills Dialog ──────────────────────────────────────────────────── -->
<Dialog.Root bind:open={addDialogOpen}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Select skills</Dialog.Title>
			<Dialog.Description>
				Choose which skills to enable for this agent. Changes apply when you save.
			</Dialog.Description>
		</Dialog.Header>

		<div class="min-h-32">
			{#if catalogLoading}
				<!-- Loading state -->
				<div class="flex flex-col items-center gap-2 py-8">
					<div
						class="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
					></div>
					<p class="text-sm text-muted-foreground">Loading skills…</p>
				</div>
			{:else if catalogError}
				<div class="flex flex-col items-center gap-2 py-8">
					<p class="text-sm text-destructive">{catalogError}</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onclick={() => {
							catalogCache = null;
							fetchCatalogIfNeeded();
						}}
					>
						Retry
					</Button>
				</div>
			{:else if catalogCache && catalogCache.length === 0}
				<p class="py-8 text-center text-sm text-muted-foreground">
					No skills are available in the catalog.
				</p>
			{:else if catalogCache}
				<div class="max-h-96 space-y-2 overflow-y-auto pr-1">
					{#each catalogCache as skill (skill.name)}
						{@const isDraft = draftSkillNames.has(skill.name)}
						<label
							class="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-3 transition-colors hover:bg-muted/50 {isDraft
								? 'border-primary bg-primary/5'
								: ''}"
						>
							<input
								type="checkbox"
								checked={isDraft}
								onchange={() => toggleDraft(skill.name)}
								class="mt-0.5 size-4 rounded border-border accent-primary"
							/>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<p class="text-sm font-medium text-foreground">{skill.name}</p>
									{#if skill.source === 'installed'}
										<span
											class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
											title="Third-party skill installed from {skill.sourceRepo ?? 'GitHub'}"
										>
											<GitBranchIcon class="size-3" />
											{skill.sourceRepo ?? 'Third-party'}
										</span>
									{/if}
									{#if skill.evolvable}
										<span
											class="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300"
										>
											<SparklesIcon class="size-3" />
											Evolvable
										</span>
									{/if}
								</div>
								<p class="mt-0.5 text-xs text-muted-foreground">{skill.description}</p>
								{#if skill.source === 'installed' && isDraft}
									<p
										class="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
									>
										<TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
										Installed from GitHub — the agent will follow these instructions and may use this
										agent's credentials.
									</p>
								{/if}
							</div>
						</label>
					{/each}
				</div>
			{/if}
		</div>

		<Dialog.Footer class="sm:justify-between">
			<a
				href="/app/skills"
				class="self-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
			>
				Manage installed skills
			</a>
			<div class="flex gap-2">
				<Button type="button" variant="outline" onclick={() => (addDialogOpen = false)}>
					Cancel
				</Button>
				<Button type="button" onclick={confirmSelection} disabled={catalogLoading || !!catalogError}>
					Done
				</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- ── Evolved Skill View Dialog ──────────────────────────────────────────── -->
<Dialog.Root bind:open={evolvedDialogOpen}>
	<Dialog.Content class="max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Evolved instructions — {viewingSkillName ?? ''}</Dialog.Title>
			<Dialog.Description>
				Read-only view of the agent-specific evolved instructions. Original instructions are defined
				in the codebase.
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4">
			{#if viewingEvolved}
				<div class="flex items-center gap-2 text-xs text-muted-foreground">
					<span class="rounded-full bg-muted px-2 py-0.5 font-medium">
						Version {viewingEvolved.version}
					</span>
					<span>Last updated {formatDate(viewingEvolved.updatedAt)}</span>
				</div>
				<pre
					class="max-h-96 overflow-y-auto rounded-md border border-border bg-muted p-4 text-xs leading-relaxed whitespace-pre-wrap">{viewingEvolved.evolvedInstructions}</pre>
			{:else}
				<div class="flex flex-col items-center gap-2 py-8">
					<SparklesIcon class="size-5 text-muted-foreground" />
					<p class="text-sm text-muted-foreground">No evolved instructions yet.</p>
					<p class="text-xs text-muted-foreground">
						The evolution engine will generate optimized instructions after the agent uses this
						skill.
					</p>
				</div>
			{/if}
		</div>
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (evolvedDialogOpen = false)}>
				Close
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

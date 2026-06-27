<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import type { CredentialMetadata, CredentialDefinition } from '@repo/types';
	import { fade } from 'svelte/transition';

	interface Props {
		/** Bindable Set — parent serialises this into hidden form inputs */
		selectedCredentialIds: Set<string>;
		/** Bindable — when true, the agent uses ALL of the owner's credentials (current & future) */
		allCredentials: boolean;
		/** Full list of available credentials loaded by the parent page */
		credentials: CredentialMetadata[];
		/** Credential definitions used to resolve icons and display names */
		definitions: CredentialDefinition[];
	}

	let {
		selectedCredentialIds = $bindable(),
		allCredentials = $bindable(),
		credentials,
		definitions
	}: Props = $props();

	// ── Add-credentials dialog state ──────────────────────────────────────────
	let addDialogOpen = $state(false);
	/** Draft copy of selection — only committed on "Done" */
	let draftCredentialIds = $state<Set<string>>(new Set());

	function openAddDialog() {
		draftCredentialIds = new Set(selectedCredentialIds);
		addDialogOpen = true;
	}

	function toggleDraft(id: string) {
		const next = new Set(draftCredentialIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		draftCredentialIds = next;
	}

	function confirmSelection() {
		selectedCredentialIds = new Set(draftCredentialIds);
		addDialogOpen = false;
	}

	function removeCredential(id: string) {
		const next = new Set(selectedCredentialIds);
		next.delete(id);
		selectedCredentialIds = next;
	}

	/** Derive the selected credential objects for display on the card */
	const selectedCredentials = $derived<CredentialMetadata[]>(
		[...selectedCredentialIds]
			.map((id) => credentials.find((c) => c.id === id))
			.filter((c): c is CredentialMetadata => c !== undefined)
	);

	function getDefinition(type: string): CredentialDefinition | undefined {
		return definitions.find((d) => d.id === type);
	}
</script>

<!-- ── Credentials Card ────────────────────────────────────────────────────── -->
<Card.Root>
	<Card.Header class="flex flex-row items-start justify-between gap-4">
		<div>
			<Card.Title class="text-sm font-medium">Credentials</Card.Title>
			<Card.Description class="text-xs">
				Select which credentials this agent can access.
			</Card.Description>
		</div>
		{#if !allCredentials}
			<Button
				type="button"
				variant="outline"
				size="sm"
				class="shrink-0 gap-1.5"
				onclick={openAddDialog}
			>
				<PlusIcon class="size-3.5" />
				Add credential
			</Button>
		{/if}
	</Card.Header>
	<Card.Content class="space-y-4">
		<!-- All-credentials toggle -->
		<div class="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
			<div class="space-y-0.5">
				<Label for="all-credentials-switch" class="text-sm font-medium">
					Use all credentials
				</Label>
				<p class="text-xs text-muted-foreground">
					Grant access to every credential you have now and any you add later.
				</p>
			</div>
			<Switch id="all-credentials-switch" bind:checked={allCredentials} />
		</div>

		{#if allCredentials}
			<p class="text-sm text-muted-foreground">
				This agent can use all of your credentials. New credentials you add later are included
				automatically.
			</p>
		{:else if selectedCredentials.length === 0}
			<div class="flex flex-col items-center gap-2 py-6">
				<p class="text-sm text-muted-foreground">No credentials selected.</p>
			</div>
		{:else}
			<!--
				Responsive chip grid — uniform columns so every chip is the same width.
				2 columns on small screens, 3 on sm+. Each chip is a fixed-height pill
				with icon + truncated name + remove button.
			-->
			<div class="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
				{#each selectedCredentials as cred (cred.id)}
					{@const def = getDefinition(cred.type)}
					<div
						class="flex h-9 items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 transition-colors hover:bg-muted/60"
						transition:fade
					>
						<!-- Service icon -->
						<div
							class="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground"
						>
							{#if def?.icon}
								<img src={def.icon} alt={cred.type} class="size-3.5 object-contain" />
							{:else}
								<ShieldIcon class="size-3" />
							{/if}
						</div>
						<!-- Name — truncates if too long -->
						<span class="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
							{cred.name}
						</span>
						<!-- Remove button -->
						<button
							type="button"
							onclick={() => removeCredential(cred.id)}
							class="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
							title="Remove {cred.name}"
						>
							<XIcon class="size-3" />
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<!-- ── Add Credentials Dialog ─────────────────────────────────────────────── -->
<Dialog.Root bind:open={addDialogOpen}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Select credentials</Dialog.Title>
			<Dialog.Description>
				Choose which credentials to grant this agent. Changes apply when you save.
			</Dialog.Description>
		</Dialog.Header>

		<div class="min-h-32">
			{#if credentials.length === 0}
				<p class="py-8 text-center text-sm text-muted-foreground">
					No credentials configured.
					<a href="/app/credentials" class="underline underline-offset-2 hover:text-foreground">
						Add credentials
					</a>
					first.
				</p>
			{:else}
				<div class="max-h-96 space-y-2 overflow-y-auto pr-1">
					{#each credentials as cred (cred.id)}
						{@const isDraft = draftCredentialIds.has(cred.id)}
						{@const def = getDefinition(cred.type)}
						<label
							class="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 transition-colors hover:bg-muted/50 {isDraft
								? 'border-primary bg-primary/5'
								: ''}"
						>
							<input
								type="checkbox"
								checked={isDraft}
								onchange={() => toggleDraft(cred.id)}
								class="size-4 rounded border-border accent-primary"
							/>
							<!-- Icon -->
							<div
								class="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground"
							>
								{#if def?.icon}
									<img src={def.icon} alt={cred.type} class="size-4 object-contain" />
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
		</div>

		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (addDialogOpen = false)}>
				Cancel
			</Button>
			<Button type="button" onclick={confirmSelection}>Done</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import type { CredentialMetadata, CredentialDefinition } from '@repo/types';

	interface Props {
		/** Bindable Set — parent serialises this into hidden form inputs */
		selectedCredentialIds: Set<string>;
		/** Full list of available credentials loaded by the parent page */
		credentials: CredentialMetadata[];
		/** Credential definitions used to resolve icons and display names */
		definitions: CredentialDefinition[];
	}

	let { selectedCredentialIds = $bindable(), credentials, definitions }: Props = $props();

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
	</Card.Header>
	<Card.Content>
		{#if selectedCredentials.length === 0}
			<div class="flex flex-col items-center gap-2 py-6">
				<p class="text-sm text-muted-foreground">No credentials selected.</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each selectedCredentials as cred (cred.id)}
					{@const def = getDefinition(cred.type)}
					<div class="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
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
						<!-- Label -->
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-foreground">{cred.name}</p>
							<p class="text-xs text-muted-foreground">{cred.type}</p>
						</div>
						<!-- Remove button -->
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => removeCredential(cred.id)}
							class="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
							title="Remove credential"
						>
							<XIcon class="size-3.5" />
						</Button>
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

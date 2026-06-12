<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { api } from '$lib/api.client.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import KnowledgeUploadButton from './knowledge-upload-button.svelte';
	import CloudImportDialog from './cloud-import-dialog.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { AgentKnowledgeAssignment, KnowledgeFile } from '@repo/types';

	interface Props {
		/** Bindable Set of knowledge file IDs — parent serialises into hidden form inputs */
		selectedKnowledgeFileIds: Set<string>;
		/** Current assignments (edit mode) — used to show per-agent ingestion status */
		assignments?: AgentKnowledgeAssignment[];
		/** Whether the agent has an embedding model selected in the form */
		embeddingConfigured?: boolean;
	}

	let {
		selectedKnowledgeFileIds = $bindable(),
		assignments = [],
		embeddingConfigured = true
	}: Props = $props();

	/** Assignment status lookup keyed by knowledgeFileId (edit mode only) */
	const assignmentByFileId = $derived(
		new Map(assignments.map((assignment) => [assignment.knowledgeFileId, assignment]))
	);

	// ── Lazily-loaded library ─────────────────────────────────────────────────
	let libraryCache = $state<KnowledgeFile[] | null>(null);
	let libraryLoading = $state(false);
	/** Error flag only — the detailed message goes through setAlert */
	let libraryError = $state(false);

	async function fetchLibraryIfNeeded() {
		if (libraryCache !== null) return;
		libraryLoading = true;
		libraryError = false;
		try {
			const res = await api('/knowledge/files');
			if (!res.ok) throw new Error('failed');
			const body = await res.json();
			libraryCache = (body.data ?? []) as KnowledgeFile[];
		} catch {
			libraryError = true;
			setAlert({
				type: 'error',
				title: 'Could not load the knowledge library',
				message: 'Please try again.',
				duration: 5000,
				show: true
			});
		} finally {
			libraryLoading = false;
		}
	}

	// ── Add dialog ────────────────────────────────────────────────────────────
	let addDialogOpen = $state(false);
	let importDialogOpen = $state(false);
	/** Draft copy of selection — committed on "Done" */
	let draftFileIds = $state<Set<string>>(new Set());

	async function openAddDialog() {
		draftFileIds = new Set(selectedKnowledgeFileIds);
		addDialogOpen = true;
		await fetchLibraryIfNeeded();
	}

	function toggleDraft(fileId: string) {
		const next = new Set(draftFileIds);
		if (next.has(fileId)) next.delete(fileId);
		else next.add(fileId);
		draftFileIds = next;
	}

	function confirmSelection() {
		selectedKnowledgeFileIds = new Set(draftFileIds);
		addDialogOpen = false;
	}

	function removeFile(fileId: string) {
		const next = new Set(selectedKnowledgeFileIds);
		next.delete(fileId);
		selectedKnowledgeFileIds = next;
	}

	/** Newly uploaded/imported files: prepend to the library and auto-check */
	function handleFilesAdded(files: KnowledgeFile[]) {
		libraryCache = [...files, ...(libraryCache ?? [])];
		const next = new Set(draftFileIds);
		for (const file of files) next.add(file.id);
		draftFileIds = next;
	}

	// ── Display data for selected files ───────────────────────────────────────
	interface SelectedFileInfo {
		id: string;
		name: string;
		sourceType?: 'upload' | 'cloud';
		provider?: string;
	}

	const selectedFileInfos = $derived<SelectedFileInfo[]>(
		[...selectedKnowledgeFileIds].map((id) => {
			const fromLibrary = libraryCache?.find((file) => file.id === id);
			const fromAssignment = assignmentByFileId.get(id);
			return {
				id,
				name: fromLibrary?.name ?? fromAssignment?.file.name ?? 'Loading…',
				sourceType: fromLibrary?.sourceType ?? fromAssignment?.file.sourceType,
				provider: fromLibrary?.provider ?? fromAssignment?.file.provider
			};
		})
	);

	function statusBadgeVariant(
		status: AgentKnowledgeAssignment['status']
	): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (status === 'ready') return 'default';
		if (status === 'error') return 'destructive';
		return 'secondary';
	}
</script>

<!-- ── Knowledge Base Card ─────────────────────────────────────────────────── -->
<Card.Root>
	<Card.Header class="flex flex-row items-start justify-between gap-4">
		<div>
			<Card.Title class="text-sm font-medium">Knowledge Base</Card.Title>
			<Card.Description class="text-xs">
				Upload files or connect external sources for the agent to reference.
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
			Add knowledge
		</Button>
	</Card.Header>
	<Card.Content>
		{#if !embeddingConfigured}
			<p class="mb-3 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
				<TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
				Knowledge files cannot be processed until an embedding model is selected above.
			</p>
		{/if}

		{#if selectedFileInfos.length === 0}
			<div class="flex flex-col items-center gap-2 py-6">
				<p class="text-sm text-muted-foreground">No knowledge files selected.</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each selectedFileInfos as file (file.id)}
					{@const assignment = assignmentByFileId.get(file.id)}
					<div class="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
						{#if file.sourceType === 'cloud'}
							<CloudIcon class="size-4 shrink-0 text-muted-foreground" />
						{:else}
							<FileTextIcon class="size-4 shrink-0 text-muted-foreground" />
						{/if}
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-foreground" title={file.name}>
								{file.name}
							</p>
							{#if file.provider}
								<p class="mt-0.5 text-xs text-muted-foreground">{file.provider}</p>
							{/if}
						</div>
						{#if assignment}
							<Badge
								variant={statusBadgeVariant(assignment.status)}
								class="shrink-0 text-xs capitalize"
								title={assignment.status === 'error' ? assignment.errorMessage : undefined}
							>
								{assignment.status}
							</Badge>
						{:else}
							<Badge variant="outline" class="shrink-0 text-xs">added on save</Badge>
						{/if}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => removeFile(file.id)}
							class="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
							title="Remove from agent"
						>
							<XIcon class="size-3.5" />
						</Button>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<!-- ── Add Knowledge Dialog ───────────────────────────────────────────────── -->
<Dialog.Root bind:open={addDialogOpen}>
	<!-- sm:max-w-lg replaces the base sm:max-w-md (tailwind-merge needs the same variant);
	     min-w-0 on grid children stops wide content blowing the track past the dialog edge -->
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header class="min-w-0">
			<Dialog.Title>Select knowledge files</Dialog.Title>
			<Dialog.Description>
				Choose files from your knowledge library. Changes apply when you save the agent.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex gap-2">
			<KnowledgeUploadButton variant="outline" size="sm" onUploaded={handleFilesAdded} />
			<Button
				type="button"
				variant="outline"
				size="sm"
				class="gap-1.5"
				onclick={() => (importDialogOpen = true)}
			>
				<CloudIcon class="size-4" />
				Import from cloud
			</Button>
		</div>

		<div class="min-h-32 min-w-0">
			{#if libraryLoading}
				<div class="flex flex-col items-center gap-2 py-8">
					<div
						class="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
					></div>
					<p class="text-sm text-muted-foreground">Loading library…</p>
				</div>
			{:else if libraryError}
				<div class="flex flex-col items-center gap-2 py-8">
					<p class="text-sm text-muted-foreground">Could not load the knowledge library.</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onclick={() => {
							libraryCache = null;
							void fetchLibraryIfNeeded();
						}}
					>
						Retry
					</Button>
				</div>
			{:else if libraryCache && libraryCache.length === 0}
				<p class="py-8 text-center text-sm text-muted-foreground">
					Your knowledge library is empty — upload a file or import from a cloud provider above.
				</p>
			{:else if libraryCache}
				<div class="max-h-80 space-y-2 overflow-x-hidden overflow-y-auto pr-1">
					{#each libraryCache as file (file.id)}
						{@const isDraft = draftFileIds.has(file.id)}
						<label
							class="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-3 transition-colors hover:bg-muted/50 {isDraft
								? 'border-primary bg-primary/5'
								: ''}"
						>
							<input
								type="checkbox"
								checked={isDraft}
								onchange={() => toggleDraft(file.id)}
								class="mt-0.5 size-4 rounded border-border accent-primary"
							/>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<p class="truncate text-sm font-medium text-foreground" title={file.name}>
										{file.name}
									</p>
									{#if file.status === 'error'}
										<Badge variant="destructive" class="text-xs" title={file.errorMessage}>
											extraction failed
										</Badge>
									{:else if file.status !== 'ready'}
										<Badge variant="secondary" class="text-xs capitalize">{file.status}</Badge>
									{/if}
								</div>
								<p class="mt-0.5 text-xs text-muted-foreground">
									{file.sourceType === 'cloud' ? (file.provider ?? 'cloud') : 'uploaded'}
								</p>
							</div>
						</label>
					{/each}
				</div>
			{/if}
		</div>

		<Dialog.Footer class="sm:justify-between">
			<a
				href="/app/knowledge"
				class="self-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
			>
				Manage knowledge library
			</a>
			<div class="flex gap-2">
				<Button type="button" variant="outline" onclick={() => (addDialogOpen = false)}>
					Cancel
				</Button>
				<Button type="button" onclick={confirmSelection} disabled={libraryLoading || libraryError}>
					Done
				</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<CloudImportDialog bind:open={importDialogOpen} onImported={handleFilesAdded} />

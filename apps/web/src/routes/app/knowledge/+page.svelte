<script lang="ts">
	import PageHeader from '$lib/components/page-header.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import KnowledgeUploadButton from '$lib/components/custom/knowledge/knowledge-upload-button.svelte';
	import CloudImportDialog from '$lib/components/custom/knowledge/cloud-import-dialog.svelte';
	import { api } from '$lib/api.client.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import type { KnowledgeFile } from '@repo/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let files = $state<KnowledgeFile[]>(data.files);
	$effect(() => {
		files = data.files;
	});

	// ── Live polling while any file is extracting ─────────────────────────────
	const POLL_INTERVAL_MS = 3000;
	const hasActiveProcessing = $derived(
		files.some((file) => file.status === 'pending' || file.status === 'processing')
	);

	$effect(() => {
		if (!hasActiveProcessing) return;
		const interval = setInterval(async () => {
			try {
				const res = await api('/knowledge/files');
				if (res.ok) {
					const body = await res.json();
					files = (body.data ?? []) as KnowledgeFile[];
				}
			} catch {
				// transient polling failure — next tick retries
			}
		}, POLL_INTERVAL_MS);
		return () => clearInterval(interval);
	});

	function handleFilesAdded(created: KnowledgeFile[]) {
		files = [...created, ...files];
	}

	// ── Cloud import dialog ───────────────────────────────────────────────────
	let importDialogOpen = $state(false);

	// ── Delete dialog ─────────────────────────────────────────────────────────
	let fileToDelete = $state<KnowledgeFile | null>(null);
	let deleteDialogOpen = $state(false);
	let deleting = $state(false);

	function openDeleteDialog(file: KnowledgeFile) {
		fileToDelete = file;
		deleteDialogOpen = true;
	}

	async function confirmDelete() {
		if (!fileToDelete) return;
		deleting = true;
		try {
			const res = await api(`/knowledge/files/${fileToDelete.id}`, { method: 'DELETE' });
			const body = await res.json();
			if (!res.ok || !body.success) {
				setAlert({
					type: 'error',
					title: 'Failed to delete file',
					message: body.error ?? 'Please try again.',
					duration: 5000,
					show: true
				});
				return;
			}
			const affected = (body.data as { affectedAgents: number }).affectedAgents;
			setAlert({
				type: 'success',
				title: 'File deleted',
				message:
					affected > 0
						? `"${fileToDelete.name}" was deleted and removed from ${affected} agent${affected === 1 ? '' : 's'}.`
						: `"${fileToDelete.name}" was deleted.`,
				duration: 5000,
				show: true
			});
			files = files.filter((file) => file.id !== fileToDelete!.id);
			deleteDialogOpen = false;
			fileToDelete = null;
		} catch {
			setAlert({
				type: 'error',
				title: 'Failed to delete file',
				message: 'Could not reach the server. Please try again.',
				duration: 5000,
				show: true
			});
		} finally {
			deleting = false;
		}
	}

	// ── Display helpers ───────────────────────────────────────────────────────
	function statusBadgeVariant(
		status: KnowledgeFile['status']
	): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (status === 'ready') return 'default';
		if (status === 'error') return 'destructive';
		return 'secondary';
	}

	function formatBytes(bytes?: number): string {
		if (bytes === undefined) return '—';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
	<title>Knowledge — AgentInt Dashboard</title>
	<meta
		name="description"
		content="Manage your knowledge library: upload documents or import from cloud storage, then assign them to agents."
	/>
</svelte:head>

<div class="flex flex-col gap-6 p-6">
	<PageHeader
		title="Knowledge"
		description="Documents your agents can reference. Files are converted to searchable text and assigned to agents from the agent edit page."
	>
		{#snippet actions()}
			<div class="flex items-center gap-2">
				<Button variant="outline" class="gap-1.5" onclick={() => (importDialogOpen = true)}>
					<CloudIcon class="size-4" />
					Import from cloud
				</Button>
				<KnowledgeUploadButton onUploaded={handleFilesAdded} />
			</div>
		{/snippet}
	</PageHeader>

	{#if files.length === 0}
		<Card.Root>
			<Card.Content>
				<div class="flex flex-col items-center gap-2 py-8">
					<BookOpenIcon class="size-6 text-muted-foreground" />
					<p class="text-sm text-muted-foreground">No knowledge files yet.</p>
					<p class="max-w-md text-center text-xs text-muted-foreground">
						Upload documents (PDF, Word, Excel, PowerPoint, text…) or import them from Google Drive,
						Dropbox, or OneDrive. Their text becomes searchable memory for the agents you assign
						them to.
					</p>
				</div>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Content>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Name</Table.Head>
							<Table.Head>Source</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head class="text-right">Size</Table.Head>
							<Table.Head>Added</Table.Head>
							<Table.Head class="w-12"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each files as file (file.id)}
							<Table.Row>
								<Table.Cell class="max-w-64">
									<div class="flex items-center gap-2">
										{#if file.sourceType === 'cloud'}
											<CloudIcon class="size-4 shrink-0 text-muted-foreground" />
										{:else}
											<FileTextIcon class="size-4 shrink-0 text-muted-foreground" />
										{/if}
										<span class="truncate text-sm font-medium" title={file.name}>{file.name}</span>
									</div>
								</Table.Cell>
								<Table.Cell>
									<Badge variant="outline" class="text-xs capitalize">
										{file.sourceType === 'cloud' ? (file.provider ?? 'cloud') : 'upload'}
									</Badge>
								</Table.Cell>
								<Table.Cell>
									<div class="flex items-center gap-1.5">
										{#if file.status === 'pending' || file.status === 'processing'}
											<div
												class="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
											></div>
										{/if}
										<Badge
											variant={statusBadgeVariant(file.status)}
											class="text-xs capitalize"
											title={file.status === 'error' ? file.errorMessage : undefined}
										>
											{file.status}
										</Badge>
									</div>
									{#if file.status === 'error' && file.errorMessage}
										<p
											class="mt-1 max-w-56 truncate text-xs text-destructive"
											title={file.errorMessage}
										>
											{file.errorMessage}
										</p>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right text-sm text-muted-foreground">
									{formatBytes(file.sizeBytes)}
								</Table.Cell>
								<Table.Cell class="text-sm text-muted-foreground">
									{formatDate(file.createdAt)}
								</Table.Cell>
								<Table.Cell>
									<Button
										variant="ghost"
										size="sm"
										class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
										title="Delete file"
										onclick={() => openDeleteDialog(file)}
									>
										<Trash2Icon class="size-3.5" />
									</Button>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<CloudImportDialog bind:open={importDialogOpen} onImported={handleFilesAdded} />

<!-- ── Delete confirmation ────────────────────────────────────────────────── -->
<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete knowledge file</Dialog.Title>
			<Dialog.Description>
				This permanently deletes "{fileToDelete?.name}" from your library and removes its content
				from every agent it is assigned to. This cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (deleteDialogOpen = false)}>
				Cancel
			</Button>
			<Button type="button" variant="destructive" disabled={deleting} onclick={confirmDelete}>
				{deleting ? 'Deleting…' : 'Delete'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

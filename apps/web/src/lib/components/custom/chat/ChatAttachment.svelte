<script lang="ts">
	import FileIcon from '@lucide/svelte/icons/file';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import ImageIcon from '@lucide/svelte/icons/image';
	import { fetchChatFileObjectUrl, formatFileSize } from '$lib/chat-files.js';
	import type { ChatFile } from '@repo/types';

	/**
	 * Renders a single chat attachment. Images show an inline thumbnail; other
	 * files show a compact chip. Clicking either opens the preview sidebar.
	 */
	let {
		file,
		agentId,
		threadId,
		onOpen
	}: {
		file: ChatFile;
		agentId: string;
		threadId: string;
		onOpen: (file: ChatFile) => void;
	} = $props();

	let thumbnailUrl = $state<string | null>(null);
	let thumbnailFailed = $state(false);

	const isPdf = $derived(
		file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
	);
	const DocIcon = $derived(isPdf ? FileTextIcon : FileIcon);

	// Lazily fetch the image thumbnail (auth requires fetching via the api client).
	$effect(() => {
		if (file.kind !== 'image') return;
		let revoked = false;
		let url: string | null = null;
		fetchChatFileObjectUrl(agentId, threadId, file.id)
			.then((u) => {
				if (revoked) {
					URL.revokeObjectURL(u);
					return;
				}
				url = u;
				thumbnailUrl = u;
			})
			.catch(() => (thumbnailFailed = true));
		return () => {
			revoked = true;
			if (url) URL.revokeObjectURL(url);
		};
	});
</script>

{#if file.kind === 'image' && !thumbnailFailed}
	<button
		type="button"
		onclick={() => onOpen(file)}
		class="block overflow-hidden rounded-lg border border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		title={file.name}
		aria-label={`Open image ${file.name}`}
	>
		{#if thumbnailUrl}
			<img src={thumbnailUrl} alt={file.name} class="max-h-48 max-w-full object-contain" />
		{:else}
			<div class="flex h-32 w-48 items-center justify-center bg-muted">
				<ImageIcon class="size-6 text-muted-foreground" />
			</div>
		{/if}
	</button>
{:else}
	<button
		type="button"
		onclick={() => onOpen(file)}
		class="flex max-w-xs items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		title={file.name}
	>
		<DocIcon class="size-5 shrink-0 text-muted-foreground" />
		<span class="min-w-0 flex-1">
			<span class="block truncate text-sm font-medium text-foreground">{file.name}</span>
			<span class="block text-xs text-muted-foreground">
				{formatFileSize(file.sizeBytes)}
				{#if file.extractionStatus === 'processing' || file.extractionStatus === 'pending'}
					· extracting…
				{/if}
			</span>
		</span>
	</button>
{/if}

<script lang="ts">
	import { ArrowUpIcon, SquareIcon } from '@lucide/svelte';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';
	import XIcon from '@lucide/svelte/icons/x';
	import FileIcon from '@lucide/svelte/icons/file';
	import ImageIcon from '@lucide/svelte/icons/image';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { api } from '$lib/api.client.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import { formatFileSize } from '$lib/chat-files.js';
	import type { ChatFile } from '@repo/types';

	/**
	 * Chat message input bar with auto-resizing textarea and file attachments.
	 *
	 * Files are uploaded as soon as they are picked (so extraction can start) and
	 * shown as removable chips; their ids are passed to onSend with the message.
	 * Image uploads are only offered when the agent's model is vision-capable.
	 *
	 * When `busy` is true the agent is running this thread's turn: the send button
	 * becomes a Stop button that calls `onStop` to cancel the turn.
	 */
	let {
		onSend,
		onStop,
		busy = false,
		disabled = false,
		placeholder = 'Message…',
		agentId,
		threadId,
		visionCapable = false
	}: {
		onSend: (content: string, fileIds: string[]) => void;
		onStop?: () => void;
		busy?: boolean;
		disabled?: boolean;
		placeholder?: string;
		agentId: string;
		threadId: string;
		visionCapable?: boolean;
	} = $props();

	let value = $state('');
	let textareaEl = $state<HTMLTextAreaElement | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let pendingFiles = $state<ChatFile[]>([]);
	let uploading = $state(false);

	// Documents are always allowed; images only when the model can see them.
	const DOC_ACCEPT = '.pdf,.docx,.xlsx,.pptx,.txt,.md,.markdown,.csv,.json,.html,.htm';
	const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif';
	let accept = $derived(visionCapable ? `${IMAGE_ACCEPT},${DOC_ACCEPT}` : DOC_ACCEPT);

	/** Auto-resize the textarea up to ~5 lines, then scroll. */
	function resizeTextarea() {
		if (!textareaEl) return;
		textareaEl.style.height = 'auto';
		const maxHeight = parseInt(getComputedStyle(textareaEl).lineHeight) * 5 + 32;
		textareaEl.style.height = Math.min(textareaEl.scrollHeight, maxHeight) + 'px';
	}

	function handleInput() {
		resizeTextarea();
	}

	function handleKeydown(e: KeyboardEvent) {
		// Send on Enter (without Shift)
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.key === '/') {
			const activeEl = document.activeElement as HTMLElement;
			const isInputFocused =
				activeEl &&
				(activeEl.tagName === 'INPUT' ||
					activeEl.tagName === 'TEXTAREA' ||
					activeEl.tagName === 'SELECT' ||
					activeEl.isContentEditable);

			if (!isInputFocused && textareaEl) {
				e.preventDefault();
				textareaEl.focus();
			}
		}
	}

	async function handleFilesSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;

		const formData = new FormData();
		for (const file of files) formData.append('files', file);
		// Reset the input so picking the same file again re-triggers change.
		input.value = '';

		uploading = true;
		try {
			const res = await api(`/runtime/${agentId}/threads/${threadId}/files`, {
				method: 'POST',
				body: formData
			});
			const body = await res.json();
			if (!res.ok || !body.success) {
				setAlert({
					type: 'error',
					title: 'Upload failed',
					message: body.error ?? 'Could not upload the file(s).',
					duration: 5000,
					show: true
				});
				return;
			}
			pendingFiles = [...pendingFiles, ...(body.data as ChatFile[])];
		} catch {
			setAlert({
				type: 'error',
				title: 'Upload failed',
				message: 'An unexpected error occurred while uploading.',
				duration: 5000,
				show: true
			});
		} finally {
			uploading = false;
		}
	}

	async function removeFile(file: ChatFile) {
		pendingFiles = pendingFiles.filter((f) => f.id !== file.id);
		// Best-effort cleanup of the orphaned upload.
		try {
			await api(`/runtime/${agentId}/threads/${threadId}/files/${file.id}`, { method: 'DELETE' });
		} catch {
			// Ignore — the row is harmless if it lingers.
		}
	}

	function handleSend() {
		const trimmed = value.trim();
		if (disabled || uploading) return;
		if (!trimmed && pendingFiles.length === 0) return;
		onSend(trimmed, pendingFiles.map((f) => f.id));
		value = '';
		pendingFiles = [];
		// Reset height after clearing
		if (textareaEl) {
			textareaEl.style.height = 'auto';
		}
	}

	let canSend = $derived(
		(value.trim().length > 0 || pendingFiles.length > 0) && !disabled && !uploading
	);
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="bg-background px-4 pt-3 pb-4">
	<!-- Pending attachment chips -->
	{#if pendingFiles.length > 0}
		<div class="mb-2 flex flex-wrap gap-2">
			{#each pendingFiles as file (file.id)}
				<div
					class="flex max-w-xs items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5"
				>
					{#if file.kind === 'image'}
						<ImageIcon class="size-4 shrink-0 text-muted-foreground" />
					{:else}
						<FileIcon class="size-4 shrink-0 text-muted-foreground" />
					{/if}
					<span class="min-w-0 flex-1">
						<span class="block truncate text-xs font-medium text-foreground">{file.name}</span>
						<span class="block text-[10px] text-muted-foreground">{formatFileSize(file.sizeBytes)}</span>
					</span>
					<button
						type="button"
						onclick={() => removeFile(file)}
						class="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label={`Remove ${file.name}`}
					>
						<XIcon class="size-3.5" />
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<div
		class="flex items-end rounded-2xl border border-border bg-card px-3 py-3 shadow-sm transition-colors focus-within:border-ring/50 focus-within:shadow-md"
	>
		<!-- Attachment button -->
		<input
			bind:this={fileInputEl}
			type="file"
			multiple
			{accept}
			class="hidden"
			onchange={handleFilesSelected}
		/>
		<Button
			variant="ghost"
			size="icon"
			class="mb-0.5 size-8 shrink-0 text-muted-foreground hover:text-foreground"
			disabled={disabled || uploading}
			onclick={() => fileInputEl?.click()}
			title="Attach file"
		>
			<PaperclipIcon class="size-4" />
			<span class="sr-only">Attach file</span>
		</Button>

		<!-- Auto-resizing textarea -->
		<Textarea
			bind:ref={textareaEl}
			bind:value
			oninput={handleInput}
			onkeydown={handleKeydown}
			{placeholder}
			rows={4}
			class="max-h-48 min-w-0 flex-1 border-0 bg-transparent px-2 py-4 text-base leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50 md:text-sm"
		/>

		<!-- Send / Stop button — Stop while the agent is running this turn -->
		{#if busy}
			<Button
				variant="default"
				size="icon"
				class="mb-0.5 size-8 shrink-0 transition-all md:size-6"
				onclick={() => onStop?.()}
				title="Stop the agent"
			>
				<SquareIcon class="size-4 fill-current md:size-2.5" />
				<span class="sr-only">Stop</span>
			</Button>
		{:else}
			<Button
				variant={canSend ? 'default' : 'ghost'}
				size="icon"
				class="mb-0.5 size-8 shrink-0 transition-all md:size-6"
				onclick={handleSend}
				disabled={!canSend}
				title="Send message"
			>
				<ArrowUpIcon class="size-4 md:size-2.5" />
				<span class="sr-only">Send</span>
			</Button>
		{/if}
	</div>

	<p class="mt-2 text-center text-[10px] text-muted-foreground/50">
		Press / to start typing. Enter to send · Shift+Enter for new line
	</p>
</div>

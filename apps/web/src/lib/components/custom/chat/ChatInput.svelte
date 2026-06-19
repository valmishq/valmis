<script lang="ts">
	import { ArrowUpIcon, SquareIcon } from '@lucide/svelte';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';

	/**
	 * Chat message input bar with auto-resizing textarea.
	 * The attachment button is a placeholder for future file/image upload.
	 *
	 * When `busy` is true the agent is running this thread's turn: the send button
	 * becomes a Stop button that calls `onStop` to cancel the turn. The parent
	 * derives `busy` from the live stream flag AND the persisted thread status, so
	 * the Stop affordance also appears for a turn left stuck at 'running'.
	 */
	let {
		onSend,
		onStop,
		busy = false,
		disabled = false,
		placeholder = 'Message…'
	}: {
		onSend: (content: string) => void;
		onStop?: () => void;
		busy?: boolean;
		disabled?: boolean;
		placeholder?: string;
	} = $props();

	let value = $state('');
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

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

	function handleSend() {
		const trimmed = value.trim();
		if (!trimmed || disabled) return;
		onSend(trimmed);
		value = '';
		// Reset height after clearing
		if (textareaEl) {
			textareaEl.style.height = 'auto';
		}
	}

	let canSend = $derived(value.trim().length > 0 && !disabled);
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="bg-background px-4 pt-3 pb-4">
	<div
		class="flex items-end rounded-2xl border border-border bg-card px-3 py-3 shadow-sm transition-colors focus-within:border-ring/50 focus-within:shadow-md"
	>
		<!-- Attachment placeholder — future file/image upload -->
		<Button
			variant="ghost"
			size="icon"
			class="mb-0.5 size-8 shrink-0 text-muted-foreground hover:text-foreground"
			disabled={true}
			title="Attach file (coming soon)"
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

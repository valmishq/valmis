<script lang="ts">
	import { ArrowUpIcon } from '@lucide/svelte';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';

	/**
	 * Chat message input bar with auto-resizing textarea.
	 * The attachment button is a placeholder for future file/image upload.
	 */
	let {
		onSend,
		disabled = false,
		placeholder = 'Message…'
	}: {
		onSend: (content: string) => void;
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

<div class="border-t border-border/50 bg-background px-4 pt-3 pb-4">
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
			class="max-h-48 flex-1 border-0 bg-transparent px-2 py-4 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
		/>

		<!-- Send button -->
		<Button
			variant={canSend ? 'default' : 'ghost'}
			size="icon"
			class="mb-0.5 size-8 shrink-0 transition-all"
			onclick={handleSend}
			disabled={!canSend}
			title="Send message"
		>
			<ArrowUpIcon class="size-4" />
			<span class="sr-only">Send</span>
		</Button>
	</div>

	<p class="mt-2 text-center text-[10px] text-muted-foreground/50">
		Press / to start typing. Enter to send · Shift+Enter for new line
	</p>
</div>

<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import hljs from 'highlight.js';
	import { browser } from '$app/environment';

	/**
	 * Renders assistant message text as sanitized HTML from markdown.
	 * Uses @tailwindcss/typography `prose` classes for styling.
	 * Code blocks are syntax-highlighted via highlight.js.
	 * Falls back to whitespace-pre-wrap plain text during SSR (no DOMPurify on server).
	 */
	let {
		content,
		isStreaming = false
	}: {
		content: string;
		isStreaming?: boolean;
	} = $props();

	/**
	 * Configure marked once with a custom code renderer that runs highlight.js.
	 * Called once at module level so it is not re-run per render.
	 */
	marked.use({
		renderer: {
			code({ text, lang }: { text: string; lang?: string }): string {
				// Use the specified language if hljs knows it, otherwise fall back to auto-detection
				const language =
					lang && hljs.getLanguage(lang)
						? lang
						: (hljs.highlightAuto(text).language ?? 'plaintext');
				const highlighted = hljs.highlight(text, { language }).value;
				return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
			}
		}
	});

	/** Parse and sanitize markdown → safe HTML. Only runs in browser (DOMPurify requires DOM). */
	let renderedHtml = $derived(
		(() => {
			if (!browser || !content) return '';
			const raw = marked.parse(content, { async: false }) as string;
			return DOMPurify.sanitize(raw, {
				// Allow standard HTML elements produced by marked
				USE_PROFILES: { html: true },
				// Preserve hljs class attributes on code blocks
				ADD_ATTR: ['target', 'rel', 'class']
			});
		})()
	);
</script>

{#if browser && renderedHtml}
	<!--
		prose-sm + text-sm: keep all text at 14px.
		[&_h1/h2/h3/h4]: cap heading sizes within chat bubble scale.
		Block spacing and first/last child margins handled via scoped <style>.
		hljs theme CSS (light + dark) is imported via <style> below.
	-->
	<div
		class="chat-markdown prose prose-sm dark:prose-invert prose-a:text-primary
			prose-a:no-underline hover:prose-a:underline
			prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5
			prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none
			prose-headings:text-foreground
			prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground
			prose-blockquote:border-primary/40 prose-blockquote:text-muted-foreground
			max-w-none font-serif text-sm leading-6
			 [&_h1]:text-base [&_h1]:font-semibold
			[&_h2]:text-sm [&_h2]:font-semibold
			[&_h3]:text-sm [&_h3]:font-medium
			[&_h4]:text-sm [&_h4]:font-medium
			[&_li]:my-0.5 [&_li]:ml-3 [&_li]:list-disc [&_ol]:my-2 [&_ul]:my-2"
	>
		{@html renderedHtml}
	</div>
{:else}
	<!-- SSR fallback or empty content — plain text -->
	{#if content}
		<p class="font-serif text-sm leading-relaxed whitespace-pre-wrap text-foreground">{content}</p>
	{/if}
{/if}

<style>
	/*
	 * highlight.js themes — light uses GitHub, dark uses GitHub Dark Dimmed.
	 * Both imported globally; the dark theme selectors are scoped under :global(.dark).
	 */
	@import 'highlight.js/styles/github.css';
	@import 'highlight.js/styles/github-dark-dimmed.css' layer(hljs-dark);

	/* Activate the dark theme only when the .dark class is on a parent element */
	:global(.dark) .chat-markdown :global(pre code.hljs) {
		color: var(--hljs-dark-fg, #adbac7);
		background: var(--hljs-dark-bg, #22272e);
	}

	/*
	 * Consistent block-level spacing for all markdown-generated elements.
	 * Scoped CSS guarantees specificity over the @tailwindcss/typography prose defaults.
	 * 0.6em top/bottom for every block; first child has no top margin, last child no bottom.
	 */
	.chat-markdown :global(p),
	.chat-markdown :global(h1),
	.chat-markdown :global(h2),
	.chat-markdown :global(h3),
	.chat-markdown :global(h4),
	.chat-markdown :global(h5),
	.chat-markdown :global(h6),
	.chat-markdown :global(ul),
	.chat-markdown :global(ol),
	.chat-markdown :global(blockquote),
	.chat-markdown :global(pre),
	.chat-markdown :global(table),
	.chat-markdown :global(hr) {
		margin-top: 1em;
		margin-bottom: 1em;
	}

	/* Remove top margin from the very first block */
	.chat-markdown :global(> *:first-child) {
		margin-top: 0;
	}

	/* Remove bottom margin from the very last block */
	.chat-markdown :global(> *:last-child) {
		margin-bottom: 0;
	}

	/* Code block container — rounded corners, visible background, overflow scroll */
	.chat-markdown :global(pre) {
		border-radius: 0.5rem;
		overflow-x: auto;
		padding: 0;
		/* Distinct light-mode background — slightly off-white so it's visible on white page */
		background-color: #f6f8fa;
		font-size: 0.8125rem;
		line-height: 1.6;
	}

	.chat-markdown :global(pre code.hljs) {
		/* Padding lives on the code element so it scrolls with the content */
		display: block;
		padding: 1rem 1.25rem;
		background: transparent;
		font-size: inherit;
		line-height: inherit;
	}

	/* Inline code styles (not syntax highlighted blocks) */
	.chat-markdown :global(code:not(.hljs)) {
		background-color: var(--muted);
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		color: var(--foreground);
	}

	/* Dark mode: override pre background to match the dark hljs theme */
	:global(.dark) .chat-markdown :global(pre) {
		background-color: #22272e;
	}

	:global(.dark) .chat-markdown :global(pre code.hljs) {
		background: transparent;
	}
</style>

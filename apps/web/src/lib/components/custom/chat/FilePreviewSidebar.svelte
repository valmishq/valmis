<script lang="ts">
	import { browser } from '$app/environment';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FileIcon from '@lucide/svelte/icons/file';
	import MarkdownRenderer from './MarkdownRenderer.svelte';
	import {
		fetchChatFileObjectUrl,
		fetchChatFileText,
		downloadChatFile,
		formatFileSize
	} from '$lib/chat-files.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import type { ChatFile } from '@repo/types';

	/**
	 * Gemini-style side panel for previewing a chat file. Images render full-size,
	 * PDFs in an iframe, text/markdown rendered inline, and everything else falls
	 * back to a download prompt.
	 */
	let {
		open = $bindable(false),
		file,
		agentId,
		threadId
	}: {
		open?: boolean;
		file: ChatFile | null;
		agentId: string;
		threadId: string;
	} = $props();

	let objectUrl = $state<string | null>(null);
	let textContent = $state<string | null>(null);
	let loadFailed = $state(false);
	let downloading = $state(false);

	// ── Resizable width ───────────────────────────────────────────────────────
	const MIN_WIDTH = 360;
	const DEFAULT_WIDTH = 640;
	const STORAGE_KEY = 'chat-file-preview-width';

	function clampWidth(w: number): number {
		const max = browser ? Math.max(MIN_WIDTH, window.innerWidth * 0.95) : 1200;
		return Math.min(Math.max(w, MIN_WIDTH), max);
	}

	let width = $state(
		browser ? clampWidth(Number(localStorage.getItem(STORAGE_KEY)) || DEFAULT_WIDTH) : DEFAULT_WIDTH
	);
	let resizing = $state(false);

	// Pointer capture keeps every move/up event routed to the handle even when the
	// cursor passes over the PDF <iframe> (an iframe would otherwise swallow the
	// events, so window listeners + an overlay can't reliably track or release).
	function startResize(e: PointerEvent) {
		e.preventDefault();
		resizing = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onResizeMove(e: PointerEvent) {
		if (!resizing) return;
		// Panel is right-anchored, so width grows as the pointer moves left.
		width = clampWidth(window.innerWidth - e.clientX);
	}

	function endResize(e: PointerEvent) {
		if (!resizing) return;
		resizing = false;
		const el = e.currentTarget as HTMLElement;
		if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
		if (browser) localStorage.setItem(STORAGE_KEY, String(Math.round(width)));
	}

	// Formats we fetch as a string and render inline. HTML is rendered as sanitized
	// markup (DOMPurify strips scripts/handlers — same safety as markdown), NOT in a
	// raw iframe.
	const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'csv', 'json', 'log', 'html', 'htm'];

	function extensionOf(name: string): string {
		const idx = name.lastIndexOf('.');
		return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
	}

	const isImage = $derived(file?.kind === 'image');
	const isPdf = $derived(
		!!file && (file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
	);
	const isMarkdown = $derived(!!file && ['md', 'markdown'].includes(extensionOf(file.name)));
	const isHtml = $derived(!!file && ['html', 'htm'].includes(extensionOf(file.name)));
	const isText = $derived(!!file && TEXT_EXTENSIONS.includes(extensionOf(file.name)));
	// image/pdf load as object URLs; text/html load as a string (html via iframe srcdoc).
	const needsObjectUrl = $derived(isImage || isPdf);

	// Load the preview content whenever the open file changes (and the panel is open).
	$effect(() => {
		objectUrl = null;
		textContent = null;
		loadFailed = false;
		if (!open || !file) return;

		const currentId = file.id;

		// Text formats: fetch as a string and render inline.
		if (isText) {
			let cancelled = false;
			fetchChatFileText(agentId, threadId, currentId)
				.then((t) => {
					if (!cancelled) textContent = t;
				})
				.catch(() => {
					if (!cancelled) loadFailed = true;
				});
			return () => {
				cancelled = true;
			};
		}

		// Image / PDF: fetch bytes as an object URL.
		if (!needsObjectUrl) return;
		let revoked = false;
		let url: string | null = null;
		fetchChatFileObjectUrl(agentId, threadId, currentId)
			.then((u) => {
				if (revoked) {
					URL.revokeObjectURL(u);
					return;
				}
				url = u;
				objectUrl = u;
			})
			.catch(() => (loadFailed = true));
		return () => {
			revoked = true;
			if (url) URL.revokeObjectURL(url);
		};
	});

	async function handleDownload() {
		if (!file) return;
		downloading = true;
		try {
			await downloadChatFile(agentId, threadId, file.id, file.name);
		} catch {
			setAlert({
				type: 'error',
				title: 'Download failed',
				message: 'Could not download the file.',
				duration: 4000,
				show: true
			});
		} finally {
			downloading = false;
		}
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content
		side="right"
		class="gap-0 p-0"
		style={`width:${width}px;max-width:95vw`}
	>
		<!-- Drag handle on the left edge to resize the panel width. Pointer capture
		     (set on this element) routes all move/up events here even over an iframe. -->
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label="Resize panel"
			onpointerdown={startResize}
			onpointermove={onResizeMove}
			onpointerup={endResize}
			onpointercancel={endResize}
			class="absolute top-0 left-0 z-50 h-full w-1.5 cursor-col-resize touch-none select-none transition-colors hover:bg-border {resizing
				? 'bg-border'
				: 'bg-transparent'}"
			title="Drag to resize"
		></div>

		{#if file}
			<Sheet.Header class="border-b border-border px-4 py-3">
				<Sheet.Title class="truncate pr-8 text-sm font-medium">{file.name}</Sheet.Title>
				<p class="text-xs text-muted-foreground">{formatFileSize(file.sizeBytes)}</p>
			</Sheet.Header>

			<div class="flex min-h-0 flex-1 flex-col overflow-auto p-4">
				{#if loadFailed}
					<div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
						<FileIcon class="size-10 text-muted-foreground" />
						<p class="text-sm text-muted-foreground">Could not load this file.</p>
					</div>
				{:else if isImage}
					{#if objectUrl}
						<img
							src={objectUrl}
							alt={file.name}
							class="mx-auto max-h-full max-w-full rounded-lg object-contain"
						/>
					{:else}
						<div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
							Loading…
						</div>
					{/if}
				{:else if isPdf}
					{#if objectUrl}
						<iframe
							src={objectUrl}
							title={file.name}
							class="h-full min-h-[70vh] w-full rounded-lg border border-border {resizing
								? 'pointer-events-none'
								: ''}"
						></iframe>
					{:else}
						<div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
							Loading…
						</div>
					{/if}
				{:else if isText}
					{#if textContent !== null}
						{#if isHtml}
							<!-- Full-fidelity render (CSS, JS, layout, head) in a SANDBOXED iframe.
							     `allow-scripts` lets the page run its own JS (Tailwind CDN, charts,
							     etc.) so it renders fully. Crucially we do NOT grant
							     `allow-same-origin`, so the frame runs in an opaque origin and
							     cannot reach the app's cookies/storage/DOM or remove its own
							     sandbox — untrusted HTML stays isolated. `allow-popups` is also
							     withheld so the previewed page cannot open new windows (e.g. a
							     phishing redirect). -->
							<iframe
								srcdoc={textContent}
								title={file.name}
								sandbox="allow-scripts"
								referrerpolicy="no-referrer"
								class="h-full min-h-[70vh] w-full rounded-lg border border-border bg-white {resizing
									? 'pointer-events-none'
									: ''}"
							></iframe>
						{:else if isMarkdown}
							<div class="prose prose-sm dark:prose-invert max-w-none">
								<MarkdownRenderer content={textContent} />
							</div>
						{:else}
							<pre
								class="overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap text-foreground">{textContent}</pre>
						{/if}
					{:else}
						<div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
							Loading…
						</div>
					{/if}
				{:else}
					<div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
						<FileIcon class="size-10 text-muted-foreground" />
						<p class="text-sm text-muted-foreground">
							Preview isn’t available for this file type.
						</p>
					</div>
				{/if}
			</div>

			<Sheet.Footer class="border-t border-border px-4 py-3">
				<Button variant="outline" onclick={handleDownload} disabled={downloading} class="w-full">
					<DownloadIcon class="size-4" />
					{downloading ? 'Downloading…' : 'Download'}
				</Button>
			</Sheet.Footer>
		{/if}
	</Sheet.Content>
</Sheet.Root>

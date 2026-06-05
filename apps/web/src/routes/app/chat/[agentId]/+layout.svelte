<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Chat layout override.
	 * Replaces the standard /app layout's padded <main> with a full-height
	 * flex container so the chat view can occupy the full viewport height.
	 * The outer Sidebar.Inset still provides the sidebar trigger header.
	 */
	let { children }: { children: Snippet } = $props();
</script>

<!--
	This layout intentionally has no padding or gap.
	The chat pages manage their own internal layout (sidebar + message area).
-->
<div class="-m-6 flex h-[calc(100vh-72px)] flex-col overflow-hidden">
	{@render children()}
</div>

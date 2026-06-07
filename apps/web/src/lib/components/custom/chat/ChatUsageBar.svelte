<script lang="ts">
	import { chatPrefsStore } from '$lib/stores/chat-prefs.store.js';
	import { browser } from '$app/environment';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';

	interface Props {
		/**
		 * Input token count from the most recent LLM call.
		 * LLM providers count the full message history as input on every call,
		 * so this equals the current context occupancy. Used for the fill bar.
		 * Seeded from DB on page load so it reflects the thread's actual state.
		 */
		latestInputTokens: number;
		/**
		 * Cumulative cost for this thread in USD.
		 * Seeded from DB totals on load and accumulated with new turns.
		 */
		sessionCost: number;
		/** Model's max context window in tokens — null for unknown/custom models */
		modelContextLength: number | null;
	}

	let { latestInputTokens, sessionCost, modelContextLength }: Props = $props();

	/** Initialise the store from localStorage on mount (browser only) */
	$effect(() => {
		if (browser) chatPrefsStore.init();
	});

	const showUsage = $derived($chatPrefsStore);

	/**
	 * Context window fill percentage (0–100).
	 * Uses latestInputTokens because providers count ALL history as input on
	 * every call — so the most recent turn's input = current context occupancy.
	 */
	const ctxPct = $derived.by(() => {
		if (!modelContextLength || modelContextLength === 0 || latestInputTokens === 0) return 0;
		return Math.min(100, Math.round((latestInputTokens / modelContextLength) * 100));
	});

	function fmtTokens(n: number): string {
		if (n === 0) return '—';
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
		return String(n);
	}

	function fmtCost(usd: number): string {
		if (usd === 0) return '$0.00';
		if (usd < 0.001) return `$${usd.toFixed(6)}`;
		if (usd < 0.01) return `$${usd.toFixed(4)}`;
		return `$${usd.toFixed(4)}`;
	}

	function fmtContextLength(n: number): string {
		if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
		if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
		return String(n);
	}
</script>

<!--
  Subtle token/cost status bar rendered between the message list and ChatInput.
  Visibility is toggled via a persistent localStorage preference (chatPrefsStore).
-->
<div class="flex items-center justify-end gap-2 px-2 py-1">
	{#if showUsage}
		<div class="flex items-center gap-3 text-xs text-muted-foreground">
			<!-- Context window fill (latestInputTokens = current context occupancy) -->
			{#if modelContextLength && latestInputTokens > 0}
				<span class="flex items-center gap-1.5">
					<div class="h-1 w-14 overflow-hidden rounded-full bg-muted">
						<div
							class="h-full rounded-full bg-primary/50 transition-all duration-300"
							style="width: {ctxPct}%"
						></div>
					</div>
					<span class="tabular-nums">
						{fmtTokens(latestInputTokens)} / {fmtContextLength(modelContextLength)}
					</span>
				</span>
				<span class="text-muted-foreground/40">·</span>
			{:else if latestInputTokens > 0}
				<span class="tabular-nums">{fmtTokens(latestInputTokens)} ctx</span>
				<span class="text-muted-foreground/40">·</span>
			{/if}

			<!-- Thread cumulative cost (seeded from DB, accumulated live) -->
			<span class="tabular-nums">{fmtCost(sessionCost)}</span>
		</div>
	{/if}

	<!-- Toggle button — always visible so users can show/hide -->
	<button
		type="button"
		onclick={() => chatPrefsStore.toggleShowUsage()}
		class="text-muted-foreground/50 transition-colors hover:text-muted-foreground"
		title={showUsage ? 'Hide usage stats' : 'Show usage stats'}
		aria-label={showUsage ? 'Hide usage stats' : 'Show usage stats'}
	>
		{#if showUsage}
			<EyeIcon class="size-3" />
		{:else}
			<EyeOffIcon class="size-3" />
		{/if}
	</button>
</div>

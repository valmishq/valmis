<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import BrainIcon from '@lucide/svelte/icons/brain';

	/** Collapsible thinking content block shown in assistant messages. */
	let {
		content,
		isStreaming = false
	}: {
		content: string;
		isStreaming?: boolean;
	} = $props();

	let expanded = $state(false);
</script>

<div class="my-1.5 overflow-hidden rounded-lg border border-border/50 bg-muted/30">
	<!-- Toggle header -->
	<button
		type="button"
		class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50"
		onclick={() => (expanded = !expanded)}
	>
		<BrainIcon class="size-3.5 shrink-0" />
		<span class="flex-1 font-medium">
			{#if isStreaming}
				Thinking…
			{:else}
				Thought process
			{/if}
		</span>
		{#if !isStreaming}
			<ChevronDownIcon
				class="size-3.5 shrink-0 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
			/>
		{/if}
	</button>

	<!-- Collapsible content -->
	{#if expanded && content}
		<div class="border-t border-border/50 px-3 py-2">
			<p class="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground italic">
				{content}
			</p>
		</div>
	{/if}
</div>

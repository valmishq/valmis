<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import CircleUserIcon from '@lucide/svelte/icons/circle-user';
	import MarkdownRenderer from '$lib/components/custom/chat/MarkdownRenderer.svelte';

	/**
	 * HITL (Human-in-the-Loop) prompt card.
	 *
	 * Rendered inside the chat message list when the agent calls ask_human.
	 * Uses shadcn card + button primitives and only theme CSS variables — no
	 * hardcoded colours — so it adapts to both light and dark mode automatically.
	 */
	let {
		prompt,
		options = [],
		onSelectOption
	}: {
		prompt: string;
		options?: string[];
		/** Called when the user clicks a pre-defined option button. */
		onSelectOption?: (option: string) => void;
	} = $props();
</script>

<!--
	Rendered as a full-width card in the message list stream.
	Intentionally not offset left/right — it sits between messages,
	not attributed to user or agent.
-->
<div class="mx-4 my-3">
	<div class="rounded-lg border border-border bg-card shadow-sm">
		<!-- Header row -->
		<div class="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
			<CircleUserIcon class="size-4 shrink-0 text-muted-foreground" />
			<p class="text-xs font-medium text-muted-foreground">Waiting for your input</p>
		</div>

		<!-- Prompt text -->
		<div class="px-4 py-3">
			<MarkdownRenderer content={prompt} />
		</div>

		<!-- Pre-defined option buttons — only rendered if provided -->
		{#if options.length > 0}
			<div class="flex flex-wrap gap-2 border-t border-border px-4 py-3">
				{#each options as option (option)}
					<Button variant="outline" size="sm" onclick={() => onSelectOption?.(option)}>
						{option}
					</Button>
				{/each}
			</div>
		{/if}
	</div>
</div>

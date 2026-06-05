<script lang="ts">
	import WrenchIcon from '@lucide/svelte/icons/wrench';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CheckIcon from '@lucide/svelte/icons/check';

	/**
	 * Expandable tool call strip shown inside assistant messages.
	 *
	 * While running (isRunning=true): shows tool name + animated dots.
	 * After the LLM has formed the call (argsJson present): name is updated.
	 * After execution (result present): expandable to show args + result.
	 */
	let {
		toolName,
		argsJson,
		result,
		isRunning = false
	}: {
		toolName: string;
		/** Pretty-printed JSON args the LLM decided to pass — the "thinking context" */
		argsJson?: string;
		/** Raw tool execution output returned to the agent */
		result?: string;
		isRunning?: boolean;
	} = $props();

	let expanded = $state(false);

	/** Whether there is any expandable content to show */
	let hasDetails = $derived(!!(argsJson || result));

	/** Whether the expand button should be interactive */
	let canExpand = $derived(!isRunning && hasDetails);

	/** Format tool name from snake_case to a human-readable label */
	function formatToolName(name: string): string {
		if (!name) return 'Using tool…';
		return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}
</script>

<div class="my-1 overflow-hidden rounded-md border border-border/40 bg-muted/20">
	<!-- Header strip — always visible -->
	<button
		type="button"
		class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 disabled:pointer-events-none"
		onclick={() => canExpand && (expanded = !expanded)}
		disabled={!canExpand}
	>
		<WrenchIcon class="size-3 shrink-0 opacity-60" />

		<span class="flex-1 font-medium">{formatToolName(toolName)}</span>

		{#if isRunning}
			<!-- Animated dots while the tool is being invoked -->
			<span class="flex items-center gap-0.5">
				<span class="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]"
				></span>
				<span class="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]"
				></span>
				<span class="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]"
				></span>
			</span>
		{:else}
			<CheckIcon class="size-3 shrink-0 text-green-500" />
			{#if hasDetails}
				<ChevronDownIcon
					class="size-3 shrink-0 transition-transform duration-150 {expanded ? 'rotate-180' : ''}"
				/>
			{/if}
		{/if}
	</button>

	<!-- Expandable detail panel -->
	{#if expanded && hasDetails}
		<div class="divide-y divide-border/30 border-t border-border/40">
			{#if argsJson}
				<!-- Arguments — what the agent chose to pass to the tool -->
				<div class="px-3 py-2">
					<p
						class="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground/60 uppercase"
					>
						Arguments
					</p>
					<pre
						class="overflow-x-auto font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground/80">{argsJson}</pre>
				</div>
			{/if}

			{#if result}
				<!-- Result — raw tool execution output -->
				<div class="px-3 py-2">
					<p
						class="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground/60 uppercase"
					>
						Result
					</p>
					<pre
						class="overflow-x-auto font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground/80">{result}</pre>
				</div>
			{/if}
		</div>
	{/if}
</div>

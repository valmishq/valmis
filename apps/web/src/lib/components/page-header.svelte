<script lang="ts">
	import { Separator } from '$lib/components/ui/separator/index.js';
	import type { Snippet } from 'svelte';

	/** Primary page title */
	let { title, description, actions }: { title: string; description?: string; actions?: Snippet } =
		$props();
</script>

<!-- Unified page header used across all dashboard pages -->
<div>
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="font-heading text-xl font-semibold tracking-tight">{title}</h1>
			{#if description}
				<p class="mt-1 text-sm text-muted-foreground">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="shrink-0">
				{@render actions()}
			</div>
		{/if}
	</div>
	<Separator class="mt-4" />
</div>

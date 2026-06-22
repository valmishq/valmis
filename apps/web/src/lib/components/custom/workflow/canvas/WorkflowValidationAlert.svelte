<script lang="ts">
	import { fly } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button/index.js';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * Dismissible validation warning that floats inside the workflow canvas.
	 * Shown only when the builder has client-side validation problems.
	 */
	interface Props {
		errors: string[];
		onDismiss: () => void;
	}

	let { errors, onDismiss }: Props = $props();
</script>

<div
	role="alert"
	class="w-[min(90vw,30rem)] rounded-lg border border-destructive/30 bg-card/95 shadow-lg backdrop-blur"
	transition:fly={{ x: 480, duration: 300 }}
>
	<div class="flex items-start gap-2 p-3">
		<TriangleAlertIcon class="mt-0.5 size-4 shrink-0 text-destructive" />
		<div class="min-w-0 flex-1 space-y-1">
			<p class="text-sm font-medium text-destructive">
				Fix {errors.length} issue{errors.length > 1 ? 's' : ''}:
			</p>
			<ul class="max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto text-sm text-destructive">
				{#each errors as message, i (i)}
					<li>{message}</li>
				{/each}
			</ul>
		</div>
		<Button
			type="button"
			variant="ghost"
			size="icon"
			class="size-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
			aria-label="Dismiss"
			onclick={onDismiss}
		>
			<XIcon class="size-4" />
		</Button>
	</div>
</div>

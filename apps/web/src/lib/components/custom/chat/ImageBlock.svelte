<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import MaximizeIcon from '@lucide/svelte/icons/maximize-2';

	/**
	 * Renders an image content block from the agent's response.
	 * Supports base64-encoded images (data URIs) and shows a click-to-expand lightbox.
	 */
	let {
		data,
		mimeType
	}: {
		data: string;
		mimeType: string;
	} = $props();

	let lightboxOpen = $state(false);
	let imgError = $state(false);

	let src = $derived(`data:${mimeType};base64,${data}`);

	function openLightbox() {
		lightboxOpen = true;
	}

	function closeLightbox() {
		lightboxOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeLightbox();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if !imgError}
	<div class="group relative mt-2 max-w-sm">
		<!-- Thumbnail with expand button -->
		<button
			type="button"
			class="relative block overflow-hidden rounded-lg border border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			onclick={openLightbox}
			aria-label="View image full size"
		>
			<img
				{src}
				alt="Agent response image"
				class="max-h-64 w-full object-cover transition-opacity group-hover:opacity-90"
				onerror={() => (imgError = true)}
			/>
			<!-- Hover overlay with expand icon -->
			<span
				class="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20"
			>
				<MaximizeIcon
					class="size-5 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100"
				/>
			</span>
		</button>
	</div>
{/if}

<!-- Lightbox overlay -->
{#if lightboxOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
		onclick={closeLightbox}
		role="dialog"
		aria-modal="true"
		aria-label="Image lightbox"
	>
		<!-- Close button -->
		<button
			type="button"
			class="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
			onclick={closeLightbox}
			aria-label="Close lightbox"
		>
			<XIcon class="size-5" />
		</button>

		<!-- Full-size image — stop click propagation so clicking the image doesn't close the lightbox -->
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
		<img
			{src}
			alt="Agent response image full size"
			class="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
			onclick={(e) => e.stopPropagation()}
		/>
	</div>
{/if}

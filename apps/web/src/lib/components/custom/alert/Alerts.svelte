<script lang="ts">
	import type { AlertType } from './alert-state.svelte';
	import { initialAlertState, setAlert } from './alert-state.svelte';
	let { type, title, message, duration, show = false }: AlertType = $props();
	import { fade, fly } from 'svelte/transition';
	import { bounceIn } from 'svelte/easing';
	import Icon from '@iconify/svelte';
	let timeout: NodeJS.Timeout;
	let styleConfig: {
		icon: string;
		color: string;
		messageColor: string;
		bgColor: string;
	} = $state({
		icon: 'heroicons-outline:check-circle',
		color: 'text-green-800',
		messageColor: 'text-green-700',
		bgColor: 'text-green-50'
	});
	$effect(() => {
		show;
		if (show) {
			timeout = scheduleHide();
		}
	});
	$effect(() => {
		type;
		if (type === 'success') {
			styleConfig = {
				icon: 'heroicons-outline:check-circle',
				color: 'text-green-600',
				messageColor: 'text-green-500',
				bgColor: 'bg-green-50'
			};
		} else if (type === 'error') {
			styleConfig = {
				icon: 'heroicons-outline:exclamation-circle',
				color: 'text-yellow-600',
				messageColor: 'text-yellow-600',
				bgColor: 'bg-yellow-50'
			};
		} else if (type === 'warning') {
			styleConfig = {
				icon: 'heroicons-outline:exclamation',
				color: 'text-yellow-600',
				messageColor: 'text-yellow-600',
				bgColor: 'bg-yellow-50'
			};
		}
	});
	function scheduleHide(): NodeJS.Timeout {
		return setTimeout(() => {
			setAlert(initialAlertState);
		}, duration);
	}
</script>

<!-- Global notification live region, render this permanently at the end of the document -->
{#if show}
	<div
		aria-live="assertive"
		class="pointer-events-none fixed inset-0 z-999999 flex items-start px-4 py-6 sm:p-6"
		in:fly={{ easing: bounceIn, x: 1000, duration: 500 }}
		out:fade={{ duration: 100 }}
		role="alert"
		onmouseenter={() => {
			clearTimeout(timeout);
		}}
		onmouseleave={() => {
			timeout = scheduleHide();
		}}
	>
		<div class="flex w-full flex-col items-center space-y-4 sm:items-end">
			<!--
         Notification panel, dynamically insert this into the live region when it needs to be displayed
   
         Entering: "transform ease-out duration-300 transition"
           From: "translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
           To: "translate-y-0 opacity-100 sm:translate-x-0"
         Leaving: "transition ease-in duration-100"
           From: "opacity-100"
           To: "opacity-0"
       -->
			<div
				class=" pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg shadow-lg ring-1 ring-black/5 {styleConfig.bgColor} "
			>
				<div class="p-4">
					<div class="flex items-start">
						<div class="shrink-0">
							<Icon icon={styleConfig.icon} class="size-6 {styleConfig.color}"></Icon>
						</div>
						<div class="ml-3 w-0 flex-1 pt-0.5">
							<p class="text-sm font-medium {styleConfig.color}">{title}</p>
							<p class="mt-1 text-sm {styleConfig.messageColor}">{message}</p>
						</div>
						<div class="ml-4 flex shrink-0">
							<button
								type="button"
								class="inline-flex rounded-md {styleConfig.color} cursor-pointer"
								onclick={() => {
									setAlert(initialAlertState);
								}}
							>
								<span class="sr-only">Close</span>
								<svg
									class="size-5"
									viewBox="0 0 20 20"
									fill="currentColor"
									aria-hidden="true"
									data-slot="icon"
								>
									<path
										d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
									/>
								</svg>
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

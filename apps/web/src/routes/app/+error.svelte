<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import SearchXIcon from '@lucide/svelte/icons/search-x';
	import ZapOffIcon from '@lucide/svelte/icons/zap-off';
	import ServerCrashIcon from '@lucide/svelte/icons/server-crash';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';

	const status = $page.status;
	const message = $page.error?.message ?? 'An unexpected error occurred';

	// Map status codes to titles and icons
	const errorConfig = $derived.by(() => {
		switch (status) {
			case 400:
				return {
					title: 'Bad Request',
					icon: AlertTriangleIcon,
					description: 'The request could not be understood by the server.'
				};
			case 401:
				return {
					title: 'Unauthorized',
					icon: ShieldAlertIcon,
					description: 'You need to be authenticated to access this resource.'
				};
			case 403:
				return {
					title: 'Forbidden',
					icon: ShieldAlertIcon,
					description: "You don't have permission to access this resource."
				};
			case 404:
				return {
					title: 'Page Not Found',
					icon: SearchXIcon,
					description: 'The page you are looking for does not exist.'
				};
			case 429:
				return {
					title: 'Too Many Requests',
					icon: ClockIcon,
					description: 'You have made too many requests. Please wait a moment and try again.'
				};
			case 500:
				return {
					title: 'Internal Server Error',
					icon: ServerCrashIcon,
					description: 'Something went wrong on our end. Please try again later.'
				};
			case 503:
				return {
					title: 'Service Unavailable',
					icon: ZapOffIcon,
					description: 'The service is temporarily unavailable. Please try again later.'
				};
			default:
				return {
					title: 'Error',
					icon: AlertTriangleIcon,
					description: 'An unexpected error occurred.'
				};
		}
	});

	function handleGoBack() {
		window.history.back();
	}

	function handleGoHome() {
		goto('/app');
	}
</script>

<svelte:head>
	<title>{errorConfig.title} — AgentInt</title>
</svelte:head>

<!-- Error page rendered inside the app layout (has sidebar + header) -->
<div class="flex min-h-[60vh] items-center justify-center">
	<Card.Root class="w-full max-w-md">
		<Card.Header class="text-center">
			<div class="mb-4 flex justify-center">
				<div class="flex size-10 items-center justify-center rounded-full bg-destructive/10">
					<errorConfig.icon class="size-4 text-destructive" />
				</div>
			</div>
			<div class="mb-2">
				<span class="font-heading text-5xl font-bold text-muted-foreground">{status}</span>
			</div>
			<Card.Title class="text-xl">{errorConfig.title}</Card.Title>
			<Card.Description class="mt-2 text-sm">{errorConfig.description}</Card.Description>
			{#if message && message !== errorConfig.description}
				<div
					class="mt-3 rounded-md bg-muted/50 p-3 text-left text-xs text-muted-foreground"
					role="alert"
				>
					{message}
				</div>
			{/if}
		</Card.Header>
		<Card.Footer class="flex flex-col gap-2 sm:flex-row sm:justify-center">
			<Button variant="outline" onclick={handleGoBack} class="w-full sm:w-auto">Go Back</Button>
			<Button onclick={handleGoHome} class="w-full sm:w-auto">Go to Dashboard</Button>
		</Card.Footer>
	</Card.Root>
</div>

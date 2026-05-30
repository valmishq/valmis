<script lang="ts">
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth.store.js';
	import type { LayoutData } from './$types';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	async function handleLogout() {
		authStore.logout();
		goto('/signin');
	}
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Nav bar -->
	<header class="border-b border-gray-200 bg-white">
		<div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
			<div class="flex items-center gap-6">
				<span class="text-sm font-semibold text-gray-900">Dashboard</span>
				<nav class="flex items-center gap-4">
					<a href="/dashboard" class="text-sm text-gray-500 hover:text-gray-900">Home</a>
					<a href="/dashboard/api-keys" class="text-sm text-gray-500 hover:text-gray-900"
						>API Keys</a
					>
				</nav>
			</div>
			<div class="flex items-center gap-4">
				<span class="text-sm text-gray-500">{data.user.email}</span>
				<button onclick={handleLogout} class="text-sm text-gray-500 hover:text-gray-900">
					Sign out
				</button>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-5xl px-4 py-8">
		{@render children()}
	</main>
</div>

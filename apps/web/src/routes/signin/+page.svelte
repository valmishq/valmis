<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api.client.js';
	import { authStore } from '$lib/stores/auth.store.js';
	import type { LoginResponse } from '@repo/types';

	let email = $state('');
	let password = $state('');
	let isLoading = $state(false);
	let error = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		isLoading = true;
		error = '';

		try {
			const res = await api('/auth/login', {
				method: 'POST',
				body: JSON.stringify({ email, password })
			});

			if (!res.ok) {
				const body = await res.json();
				error = body.error ?? 'Login failed';
				return;
			}

			const body = await res.json();
			const data = body.data as LoginResponse;
			authStore.login(data.accessToken, data.user);
			goto('/dashboard');
		} catch {
			error = 'An unexpected error occurred';
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Sign In</title>
	<meta name="description" content="Sign in to your account" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
	<div class="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
		<h1 class="mb-6 text-2xl font-semibold text-gray-900">Sign in</h1>

		{#if error}
			<p class="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
				{error}
			</p>
		{/if}

		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				<label for="email" class="mb-1 block text-sm font-medium text-gray-700">Email</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					required
					autocomplete="email"
					class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
				/>
			</div>

			<div>
				<label for="password" class="mb-1 block text-sm font-medium text-gray-700">Password</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					required
					autocomplete="current-password"
					class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
				/>
			</div>

			<button
				type="submit"
				disabled={isLoading}
				class="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
			>
				{isLoading ? 'Signing in…' : 'Sign in'}
			</button>
		</form>
	</div>
</div>

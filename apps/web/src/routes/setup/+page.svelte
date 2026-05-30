<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api.client.js';

	let email = $state('');
	let password = $state('');
	let firstName = $state('');
	let lastName = $state('');
	let isLoading = $state(false);
	let error = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		isLoading = true;
		error = '';

		try {
			const res = await api('/auth/setup', {
				method: 'POST',
				body: JSON.stringify({
					email,
					password,
					first_name: firstName || undefined,
					last_name: lastName || undefined
				})
			});

			if (!res.ok) {
				const body = await res.json();
				error = body.error ?? 'Setup failed';
				return;
			}

			goto('/signin');
		} catch {
			error = 'An unexpected error occurred';
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Setup — Create Admin Account</title>
	<meta name="description" content="Create your first admin account to get started" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
	<div class="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
		<h1 class="mb-2 text-2xl font-semibold text-gray-900">Welcome</h1>
		<p class="mb-6 text-sm text-gray-500">Create your admin account to get started.</p>

		{#if error}
			<p class="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
				{error}
			</p>
		{/if}

		<form onsubmit={handleSubmit} class="space-y-4">
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="firstName" class="mb-1 block text-sm font-medium text-gray-700"
						>First name</label
					>
					<input
						id="firstName"
						type="text"
						bind:value={firstName}
						autocomplete="given-name"
						class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
					/>
				</div>
				<div>
					<label for="lastName" class="mb-1 block text-sm font-medium text-gray-700"
						>Last name</label
					>
					<input
						id="lastName"
						type="text"
						bind:value={lastName}
						autocomplete="family-name"
						class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
					/>
				</div>
			</div>

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
					autocomplete="new-password"
					class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
				/>
			</div>

			<button
				type="submit"
				disabled={isLoading}
				class="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
			>
				{isLoading ? 'Creating account…' : 'Create admin account'}
			</button>
		</form>
	</div>
</div>

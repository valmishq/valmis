<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api.client.js';
	import { authStore } from '$lib/stores/auth.store.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
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
			goto('/app');
		} catch {
			error = 'An unexpected error occurred';
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Sign In — Valmis</title>
	<meta name="description" content="Sign in to your Valmis account." />
	<meta name="keywords" content="sign in, login, Valmis, integration hub" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-muted/40 p-4">
	<Card.Root class="w-full max-w-sm">
		<Card.Header class="pb-4">
			<Card.Title class="text-xl">Sign in</Card.Title>
			<Card.Description>Enter your credentials to access the dashboard.</Card.Description>
		</Card.Header>

		<Card.Content>
			{#if error}
				<p
					class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
					role="alert"
				>
					{error}
				</p>
			{/if}

			<form onsubmit={handleSubmit} class="space-y-4">
				<div class="space-y-1.5">
					<Label for="email">Email</Label>
					<Input
						id="email"
						type="email"
						bind:value={email}
						required
						autocomplete="email"
						placeholder="you@example.com"
					/>
				</div>

				<div class="space-y-1.5">
					<Label for="password">Password</Label>
					<Input
						id="password"
						type="password"
						bind:value={password}
						required
						autocomplete="current-password"
						placeholder="••••••••"
					/>
				</div>

				<Button type="submit" class="w-full" disabled={isLoading}>
					{isLoading ? 'Signing in…' : 'Sign in'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api.client.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

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
	<meta
		name="description"
		content="Create your first admin account to get started with OpenAgent Integration Hub."
	/>
	<meta name="keywords" content="setup, admin, account, OpenAgent, integration hub" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-muted/40 p-4">
	<Card.Root class="w-full max-w-sm">
		<Card.Header class="pb-4">
			<Card.Title class="text-xl">Welcome</Card.Title>
			<Card.Description>Create your admin account to get started.</Card.Description>
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
				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1.5">
						<Label for="firstName">First name</Label>
						<Input
							id="firstName"
							type="text"
							bind:value={firstName}
							autocomplete="given-name"
							placeholder="Jane"
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="lastName">Last name</Label>
						<Input
							id="lastName"
							type="text"
							bind:value={lastName}
							autocomplete="family-name"
							placeholder="Doe"
						/>
					</div>
				</div>

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
						autocomplete="new-password"
						placeholder="••••••••"
					/>
				</div>

				<Button type="submit" class="w-full" disabled={isLoading}>
					{isLoading ? 'Creating account…' : 'Create admin account'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>

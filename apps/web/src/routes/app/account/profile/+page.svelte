<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/api.client.js';
	import { authStore } from '$lib/stores/auth.store.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import type { LoginResponse } from '@repo/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// ── Profile form state ────────────────────────────────────────────────────
	let firstName = $state(data.user?.first_name ?? '');
	let lastName = $state(data.user?.last_name ?? '');
	let isSavingProfile = $state(false);

	// ── Email dialog state ────────────────────────────────────────────────────
	let emailDialogOpen = $state(false);
	let newEmail = $state('');
	let currentPasswordForEmail = $state('');
	let isSavingEmail = $state(false);
	let emailError = $state('');

	// Parallel copy of EMAIL_REGEX in `@repo/utils` (validation.ts) — duplicated
	// deliberately because @repo/utils resolves its runtime entry to ./dist and is
	// Node-only, so the browser bundle cannot import it. Keep the two in sync.
	const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	/** Reset all email-dialog fields and close it. */
	function closeEmailDialog() {
		emailDialogOpen = false;
		newEmail = '';
		currentPasswordForEmail = '';
		emailError = '';
	}

	// ── Password dialog state ─────────────────────────────────────────────────
	let passwordDialogOpen = $state(false);
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let isSavingPassword = $state(false);
	let passwordError = $state('');

	/** Reset all password fields and close the dialog. */
	function closePasswordDialog() {
		passwordDialogOpen = false;
		currentPassword = '';
		newPassword = '';
		confirmPassword = '';
		passwordError = '';
	}

	/** Submit updated first/last name to PATCH /users/profile */
	async function handleProfileSave(e: SubmitEvent) {
		e.preventDefault();
		isSavingProfile = true;

		try {
			const res = await api('/users/profile', {
				method: 'PATCH',
				body: JSON.stringify({ first_name: firstName, last_name: lastName })
			});

			if (!res.ok) {
				const body = await res.json();
				setAlert({
					type: 'error',
					title: 'Update failed',
					message: body.error ?? 'Failed to update profile',
					duration: 5000,
					show: true
				});
				return;
			}

			// Refresh the layout load so the sidebar reflects the new name.
			await invalidateAll();

			setAlert({
				type: 'success',
				title: 'Profile updated',
				message: 'Your name has been saved.',
				duration: 4000,
				show: true
			});
		} catch {
			setAlert({
				type: 'error',
				title: 'Update failed',
				message: 'An unexpected error occurred.',
				duration: 5000,
				show: true
			});
		} finally {
			isSavingProfile = false;
		}
	}

	/** Submit password change to POST /users/profile/password */
	async function handlePasswordSave(e: SubmitEvent) {
		e.preventDefault();
		passwordError = '';

		if (newPassword !== confirmPassword) {
			passwordError = 'New passwords do not match.';
			return;
		}

		if (newPassword.length < 8) {
			passwordError = 'New password must be at least 8 characters.';
			return;
		}

		isSavingPassword = true;

		try {
			const res = await api('/users/profile/password', {
				method: 'POST',
				body: JSON.stringify({ currentPassword, newPassword })
			});

			if (!res.ok) {
				const body = await res.json();
				passwordError = body.error ?? 'Failed to update password';
				return;
			}

			closePasswordDialog();

			setAlert({
				type: 'success',
				title: 'Password updated',
				message: 'Your password has been changed successfully.',
				duration: 4000,
				show: true
			});
		} catch {
			passwordError = 'An unexpected error occurred.';
		} finally {
			isSavingPassword = false;
		}
	}

	/** Submit email change to POST /users/profile/email, then refresh the session token. */
	async function handleEmailSave(e: SubmitEvent) {
		e.preventDefault();
		emailError = '';

		if (!EMAIL_REGEX.test(newEmail.trim())) {
			emailError = 'Please enter a valid email address.';
			return;
		}

		isSavingEmail = true;

		try {
			const res = await api('/users/profile/email', {
				method: 'POST',
				body: JSON.stringify({ newEmail: newEmail.trim(), currentPassword: currentPasswordForEmail })
			});

			const body = await res.json();

			if (!res.ok) {
				emailError = body.error ?? 'Failed to update email';
				return;
			}

			// Re-issue the session with the new email so the sidebar/account menu (driven
			// by the JWT) update immediately, then re-run the page load to refresh the field.
			const result = body.data as LoginResponse;
			authStore.login(result.accessToken, result.user);
			await invalidateAll();

			closeEmailDialog();

			setAlert({
				type: 'success',
				title: 'Email updated',
				message: 'Your email address has been changed.',
				duration: 4000,
				show: true
			});
		} catch {
			emailError = 'An unexpected error occurred.';
		} finally {
			isSavingEmail = false;
		}
	}
</script>

<svelte:head>
	<title>Profile — Valmis Dashboard</title>
	<meta
		name="description"
		content="Manage your Valmis profile. Update your name and change your password."
	/>
	<meta name="keywords" content="profile, settings, account, password, Valmis" />
</svelte:head>

<!-- Change password dialog -->
<Dialog.Root bind:open={passwordDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Change password</Dialog.Title>
			<Dialog.Description>
				Enter your current password and choose a new one. The new password must be at least 8
				characters.
			</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={handlePasswordSave} class="space-y-4">
			{#if passwordError}
				<p class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
					{passwordError}
				</p>
			{/if}

			<!-- Current password -->
			<div class="space-y-1.5">
				<Label for="currentPassword">Current password</Label>
				<Input
					id="currentPassword"
					type="password"
					bind:value={currentPassword}
					required
					autocomplete="current-password"
					placeholder="Enter current password"
				/>
			</div>

			<Separator />

			<!-- New password -->
			<div class="space-y-1.5">
				<Label for="newPassword">New password</Label>
				<Input
					id="newPassword"
					type="password"
					bind:value={newPassword}
					required
					autocomplete="new-password"
					placeholder="At least 8 characters"
				/>
			</div>

			<!-- Confirm new password -->
			<div class="space-y-1.5">
				<Label for="confirmPassword">Confirm new password</Label>
				<Input
					id="confirmPassword"
					type="password"
					bind:value={confirmPassword}
					required
					autocomplete="new-password"
					placeholder="Repeat new password"
				/>
			</div>

			<Dialog.Footer class="gap-2 sm:gap-0">
				<Button
					type="button"
					variant="outline"
					onclick={closePasswordDialog}
					disabled={isSavingPassword}
				>
					Cancel
				</Button>
				<Button type="submit" disabled={isSavingPassword}>
					{isSavingPassword ? 'Updating…' : 'Update password'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Change email dialog -->
<Dialog.Root bind:open={emailDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Change email</Dialog.Title>
			<Dialog.Description>
				Enter your new email address and your current password to confirm.
			</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={handleEmailSave} class="space-y-4">
			{#if emailError}
				<p class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
					{emailError}
				</p>
			{/if}

			<!-- New email -->
			<div class="space-y-1.5">
				<Label for="newEmail">New email</Label>
				<Input
					id="newEmail"
					type="email"
					bind:value={newEmail}
					required
					autocomplete="email"
					placeholder="you@example.com"
				/>
			</div>

			<Separator />

			<!-- Current password -->
			<div class="space-y-1.5">
				<Label for="currentPasswordForEmail">Current password</Label>
				<Input
					id="currentPasswordForEmail"
					type="password"
					bind:value={currentPasswordForEmail}
					required
					autocomplete="current-password"
					placeholder="Enter current password"
				/>
			</div>

			<Dialog.Footer class="gap-2 sm:gap-0">
				<Button type="button" variant="outline" onclick={closeEmailDialog} disabled={isSavingEmail}>
					Cancel
				</Button>
				<Button type="submit" disabled={isSavingEmail}>
					{isSavingEmail ? 'Updating…' : 'Update email'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<PageHeader title="Profile" description="Manage your account details and security settings." />

<!-- Personal information card -->
<Card.Root>
	<Card.Header class="pb-4">
		<Card.Title class="text-sm font-medium">Personal information</Card.Title>
		<Card.Description class="text-xs">Update your display name and email address.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form onsubmit={handleProfileSave} class="space-y-4">
			<!-- Email (changed via the dialog, which requires the current password) -->
			<div class="space-y-1.5">
				<Label for="email">Email</Label>
				<div class="flex items-center gap-2">
					<Input
						id="email"
						type="email"
						value={data.user?.email ?? ''}
						disabled
						class="flex-1 text-muted-foreground"
					/>
					<Button type="button" variant="outline" onclick={() => (emailDialogOpen = true)}>
						Change
					</Button>
				</div>
				<p class="text-xs text-muted-foreground">Used for signing in.</p>
			</div>

			<div class="flex flex-wrap gap-4">
				<!-- First name -->
				<div class="min-w-44 flex-1 space-y-1.5">
					<Label for="firstName">First name</Label>
					<Input id="firstName" type="text" bind:value={firstName} placeholder="First name" />
				</div>

				<!-- Last name -->
				<div class="min-w-44 flex-1 space-y-1.5">
					<Label for="lastName">Last name</Label>
					<Input id="lastName" type="text" bind:value={lastName} placeholder="Last name" />
				</div>
			</div>

			<div class="flex justify-end">
				<Button type="submit" disabled={isSavingProfile}>
					{isSavingProfile ? 'Saving…' : 'Save changes'}
				</Button>
			</div>
		</form>
	</Card.Content>
</Card.Root>

<!-- Security card -->
<Card.Root>
	<Card.Header class="pb-4">
		<Card.Title class="text-sm font-medium">Security</Card.Title>
		<Card.Description class="text-xs">Manage your account password.</Card.Description>
	</Card.Header>
	<Card.Content>
		<div class="flex items-center justify-between">
			<div>
				<p class="text-sm font-medium text-foreground">Password</p>
				<p class="mt-0.5 text-xs text-muted-foreground">
					Change your password to keep your account secure.
				</p>
			</div>
			<Button variant="outline" onclick={() => (passwordDialogOpen = true)}>Change password</Button>
		</div>
	</Card.Content>
</Card.Root>

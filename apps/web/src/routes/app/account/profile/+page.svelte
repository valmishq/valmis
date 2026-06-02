<script lang="ts">
	import { api } from '$lib/api.client.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// ── Profile form state ────────────────────────────────────────────────────
	let firstName = $state(data.user?.first_name ?? '');
	let lastName = $state(data.user?.last_name ?? '');
	let isSavingProfile = $state(false);

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
</script>

<svelte:head>
	<title>Profile — OpenAgent Dashboard</title>
	<meta
		name="description"
		content="Manage your OpenAgent profile. Update your name and change your password."
	/>
	<meta name="keywords" content="profile, settings, account, password, OpenAgent" />
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

<PageHeader title="Profile" description="Manage your account details and security settings." />

<!-- Personal information card -->
<Card.Root>
	<Card.Header class="pb-4">
		<Card.Title class="text-sm font-medium">Personal information</Card.Title>
		<Card.Description class="text-xs">
			Update your display name. Your email address cannot be changed here.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form onsubmit={handleProfileSave} class="space-y-4">
			<!-- Email (read-only) -->
			<div class="space-y-1.5">
				<Label for="email">Email</Label>
				<Input
					id="email"
					type="email"
					value={data.user?.email ?? ''}
					disabled
					class="text-muted-foreground"
				/>
				<p class="text-xs text-muted-foreground">Email cannot be changed.</p>
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

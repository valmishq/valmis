<script lang="ts">
	import { api } from '$lib/api.client.js';
	import { connectOAuth2 } from '$lib/oauth2.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import CheckCircleIcon from '@lucide/svelte/icons/check-circle-2';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import LinkIcon from '@lucide/svelte/icons/link';
	import type { CredentialMetadata, CredentialDefinition } from '@repo/types';

	let {
		credential,
		definition,
		onUpdated
	}: {
		credential: CredentialMetadata;
		definition: CredentialDefinition;
		onUpdated?: (cred: CredentialMetadata) => void;
	} = $props();

	const isOAuth2 = definition.type === 'oauth2';
	const hasTest = Boolean(definition.testRequest);

	let connectedAccount = $state<string | undefined>(credential.connectedAccount);
	let isAuthorized = $state<boolean>(Boolean(credential.isAuthorized));
	let oauthBusy = $state(false);
	let testStatus = $state<'idle' | 'testing'>('idle');

	/** Re-fetch the credential metadata so connectedAccount / isAuthorized reflect the latest state */
	async function refreshCredential() {
		try {
			const res = await api(`/credentials/${credential.id}`);
			if (!res.ok) return;
			const body = await res.json();
			const updated = body.data as CredentialMetadata | undefined;
			if (updated) {
				connectedAccount = updated.connectedAccount;
				isAuthorized = Boolean(updated.isAuthorized);
				onUpdated?.(updated);
			}
		} catch {
			// silently ignore — the alert from the calling action already informs the user
		}
	}

	// ── OAuth2 connect (popup) ──────────────────────────────────────────────────
	async function handleConnect() {
		oauthBusy = true;
		const result = await connectOAuth2(credential.id);
		oauthBusy = false;

		if (result.ok) {
			await refreshCredential();
			isAuthorized = true;
			setAlert({
				type: 'success',
				title: 'Account connected',
				message: 'OAuth2 authorization completed successfully.',
				duration: 5000,
				show: true
			});
		} else {
			setAlert({
				type: 'error',
				title: 'Connection failed',
				message: result.message ?? 'OAuth2 authorization failed.',
				duration: 5000,
				show: true
			});
		}
	}

	// ── Test connection ─────────────────────────────────────────────────────────
	async function handleTest() {
		testStatus = 'testing';
		try {
			const res = await api(`/credentials/${credential.id}/test`, { method: 'POST' });
			const body = await res.json();
			if (body.success && body.data?.valid) {
				setAlert({
					type: 'success',
					title: 'Connection successful',
					message: `Connected to "${credential.name}" (HTTP ${body.data.status})`,
					duration: 5000,
					show: true
				});
				await refreshCredential();
			} else {
				setAlert({
					type: 'error',
					title: 'Connection failed',
					message: body.error ?? 'Connection test failed',
					duration: 5000,
					show: true
				});
			}
		} catch {
			setAlert({
				type: 'error',
				title: 'Connection failed',
				message: 'Unexpected error during test',
				duration: 5000,
				show: true
			});
		} finally {
			testStatus = 'idle';
		}
	}
</script>

<div class="space-y-4">
	<!-- Current connection status -->
	{#if connectedAccount || isAuthorized}
		<div
			class="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5"
			role="status"
		>
			<CheckCircleIcon class="size-4 shrink-0 text-green-500" />
			<span class="truncate text-sm text-foreground">
				{connectedAccount ?? 'Connected'}
			</span>
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">
			{#if isOAuth2}
				Connect your account to authorize this credential, then test the connection.
			{:else if hasTest}
				Test the connection to verify this credential works.
			{:else}
				This credential has been saved.
			{/if}
		</p>
	{/if}

	<!-- Actions -->
	<div class="flex flex-wrap gap-2">
		{#if isOAuth2}
			<Button variant="outline" onclick={handleConnect} disabled={oauthBusy} class="gap-2">
				{#if oauthBusy}
					<LoaderIcon class="size-4 animate-spin" />
					Connecting…
				{:else}
					<LinkIcon class="size-4" />
					{isAuthorized ? 'Re-authorize' : 'Connect account'}
				{/if}
			</Button>
		{/if}

		{#if hasTest}
			<Button
				variant="outline"
				onclick={handleTest}
				disabled={testStatus === 'testing' || (isOAuth2 && !isAuthorized)}
				class="gap-2"
			>
				{#if testStatus === 'testing'}
					<LoaderIcon class="size-4 animate-spin" />
					Testing…
				{:else}
					<CheckCircleIcon class="size-4" />
					Test connection
				{/if}
			</Button>
		{/if}
	</div>
</div>

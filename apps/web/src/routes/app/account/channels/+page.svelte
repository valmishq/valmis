<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/page-header.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import { api } from '$lib/api.client.js';
	import type { PageData, ActionData } from './$types';
	import type { ChannelLink } from '@repo/types';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import CheckIcon from '@lucide/svelte/icons/check';
	import SmartphoneIcon from '@lucide/svelte/icons/smartphone';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// ── Channel metadata ─────────────────────────────────────────────────────
	/**
	 * Per-channel display config.
	 * credentialType — the credential `type` value required for this channel.
	 * If null, no credential is needed (future channels without a bot token concept).
	 */
	const CHANNEL_META: Record<
		string,
		{
			label: string;
			color: string;
			setupText: string;
			/** Credential definition `type` required for this channel, or null if none */
			credentialType: string | null;
		}
	> = {
		telegram: {
			label: 'Telegram',
			color: 'bg-sky-500',
			setupText: 'Open your Telegram bot and send the command shown below.',
			credentialType: 'telegram-bot'
		},
		whatsapp: {
			label: 'WhatsApp',
			color: 'bg-green-500',
			setupText: 'Send the code to your WhatsApp bot number.',
			credentialType: 'whatsapp-bot'
		},
		discord: {
			label: 'Discord',
			color: 'bg-indigo-500',
			setupText: 'Use the /pair command in your Discord server.',
			credentialType: 'discord-bot'
		}
	};

	const SUPPORTED_CHANNELS = Object.keys(CHANNEL_META);

	function channelLabel(channel: string): string {
		return CHANNEL_META[channel]?.label ?? channel;
	}

	function channelColor(channel: string): string {
		return CHANNEL_META[channel]?.color ?? 'bg-muted-foreground';
	}

	function agentName(agentId: string): string {
		return data.agents.find((a) => a.id === agentId)?.name ?? 'Unknown agent';
	}

	// ── Connect dialog ────────────────────────────────────────────────────────

	let connectOpen = $state(false);
	let connectChannel = $state('telegram');
	let connectAgentId = $state('');
	let connectCredentialId = $state('');
	let isGenerating = $state(false);

	/** Pairing code result from the last successful generateCode action */
	let pairingCode = $state<{ code: string; expiresAt: string; channel: string } | null>(null);
	let codeCopied = $state(false);

	$effect(() => {
		if (form?.success && form.code) {
			pairingCode = { code: form.code, expiresAt: form.expiresAt, channel: form.channel };
		}
	});

	// Reset credential selection when channel changes
	$effect(() => {
		connectChannel;
		connectCredentialId = '';
	});

	function handleCopyCode() {
		if (!pairingCode) return;
		navigator.clipboard.writeText(`/pair ${pairingCode.code}`).then(() => {
			codeCopied = true;
			setTimeout(() => (codeCopied = false), 2000);
		});
	}

	function formatExpiry(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}

	/** The credential type required by the currently selected channel (or null) */
	const requiredCredentialType = $derived(CHANNEL_META[connectChannel]?.credentialType ?? null);

	/** Credentials matching the required type for the current channel */
	const availableCredentials = $derived(
		requiredCredentialType ? data.credentials.filter((c) => c.type === requiredCredentialType) : []
	);

	/** Whether the channel requires a credential but none exist yet */
	const missingCredentials = $derived(
		requiredCredentialType !== null && availableCredentials.length === 0
	);

	/** Form is valid to submit */
	const canSubmit = $derived(
		connectAgentId.length > 0 &&
			!missingCredentials &&
			(requiredCredentialType === null || connectCredentialId.length > 0)
	);

	// ── Tool notifications toggle ─────────────────────────────────────────────

	/**
	 * Optimistic local state for notifyToolUsage, keyed by link id.
	 * Initialised on first toggle from the server-provided value.
	 */
	let notifyState = $state<Record<string, boolean>>({});

	function getNotify(link: ChannelLink): boolean {
		return notifyState[link.id] ?? link.notifyToolUsage;
	}

	async function handleToggleNotify(link: ChannelLink, checked: boolean) {
		// Optimistically update UI immediately
		notifyState[link.id] = checked;

		try {
			const res = await api(`/channels/links/${link.id}`, {
				method: 'PATCH',
				body: JSON.stringify({
					notifyToolUsage: checked,
					agentId: link.agentId,
					threadMode: link.threadMode
				})
			});

			if (!res.ok) {
				// Revert optimistic update on failure
				notifyState[link.id] = !checked;
				const body = await res.json().catch(() => ({}));
				setAlert({
					type: 'error',
					title: 'Update failed',
					message: (body as { error?: string }).error ?? 'Could not update settings.',
					duration: 5000,
					show: true
				});
			}
		} catch {
			// Revert on network error
			notifyState[link.id] = !checked;
			setAlert({
				type: 'error',
				title: 'Update failed',
				message: 'Could not update settings.',
				duration: 5000,
				show: true
			});
		}
	}

	// ── Delete dialog ─────────────────────────────────────────────────────────

	let deleteTarget = $state<ChannelLink | null>(null);
	let deleteOpen = $state(false);
	let isDeleting = $state(false);

	function openDelete(link: ChannelLink) {
		deleteTarget = link;
		deleteOpen = true;
	}
</script>

<svelte:head>
	<title>Channels — Account — Valmis</title>
	<meta
		name="description"
		content="Connect your AI agents to external messaging channels like Telegram, WhatsApp, and Discord."
	/>
</svelte:head>

<div class="p-6">
	<PageHeader
		title="Channels"
		description="Connect your agents to external messaging platforms. Pair a channel to chat with any agent from Telegram, WhatsApp, Discord, and more."
	>
		{#snippet actions()}
			<Button onclick={() => (connectOpen = true)} size="sm">
				<PlusIcon class="mr-2 size-4" />
				Connect channel
			</Button>
		{/snippet}
	</PageHeader>

	<!-- Active channel links -->
	{#if data.links.length === 0}
		<Card.Root class="mt-6">
			<Card.Content class="flex flex-col items-center gap-4 py-14 text-center">
				<SmartphoneIcon class="size-10 text-muted-foreground/30" />
				<div>
					<p class="font-medium text-foreground">No channels connected</p>
					<p class="mt-1 text-sm text-muted-foreground">
						Connect a channel to start chatting with your agents from external platforms.
					</p>
				</div>
				<Button onclick={() => (connectOpen = true)} variant="outline" size="sm">
					<PlusIcon class="mr-2 size-4" />
					Connect your first channel
				</Button>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.links as link (link.id)}
				<Card.Root>
					<Card.Header class="pb-3">
						<div class="flex items-start justify-between">
							<div class="flex items-center gap-2">
								<span class="size-2.5 rounded-full {channelColor(link.channel)}"></span>
								<Card.Title class="text-base">{channelLabel(link.channel)}</Card.Title>
							</div>
							<Badge variant={link.isVerified ? 'default' : 'outline'} class="text-[10px]">
								{link.isVerified ? 'Paired' : 'Pending'}
							</Badge>
						</div>
						{#if link.displayName}
							<Card.Description class="text-xs">{link.displayName}</Card.Description>
						{/if}
					</Card.Header>
					<Card.Content class="space-y-3 pb-4">
						<div>
							<p class="text-xs font-medium text-muted-foreground">Agent</p>
							<p class="mt-0.5 text-sm text-foreground">{agentName(link.agentId)}</p>
						</div>
						<div>
							<p class="text-xs font-medium text-muted-foreground">Thread mode</p>
							<p class="mt-0.5 text-sm text-foreground capitalize">
								{link.threadMode === 'per_session' ? 'Per session' : 'Persistent'}
							</p>
						</div>

						<!-- Tool notifications toggle — uses direct API call, not form submission -->
						<div class="flex items-center justify-between">
							<Label class="text-xs text-muted-foreground" for="notify-{link.id}">
								Tool notifications
							</Label>
							<Switch
								id="notify-{link.id}"
								checked={getNotify(link)}
								onCheckedChange={(checked) => handleToggleNotify(link, checked)}
							/>
						</div>
					</Card.Content>
					<Card.Footer class="border-t border-border/50 pt-3">
						<Button
							variant="ghost"
							size="sm"
							class="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
							onclick={() => openDelete(link)}
						>
							<Trash2Icon class="mr-2 size-3.5" />
							Disconnect
						</Button>
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<!-- ── Connect channel dialog ──────────────────────────────────────────────── -->
<Dialog.Root bind:open={connectOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Connect a channel</Dialog.Title>
			<Dialog.Description>
				Select a platform and an agent. You'll receive a pairing code to send to the bot.
			</Dialog.Description>
		</Dialog.Header>

		{#if pairingCode}
			<!-- Step 2: show the pairing code -->
			<div class="space-y-4">
				<div class="rounded-lg border border-border bg-muted/40 p-4 text-center">
					<p class="mb-1 text-xs text-muted-foreground">
						Send this command to your {channelLabel(pairingCode.channel)} bot
					</p>
					<p class="font-mono text-2xl font-bold tracking-widest text-foreground">
						/pair {pairingCode.code}
					</p>
					<p class="mt-2 text-[10px] text-muted-foreground">
						Expires at {formatExpiry(pairingCode.expiresAt)} — valid for 10 minutes
					</p>
				</div>
				<p class="text-center text-xs text-muted-foreground">
					{CHANNEL_META[pairingCode.channel]?.setupText ?? ''}
				</p>
				<Button class="w-full" variant="outline" onclick={handleCopyCode}>
					{#if codeCopied}
						<CheckIcon class="mr-2 size-4 text-green-500" />
						Copied!
					{:else}
						<CopyIcon class="mr-2 size-4" />
						Copy command
					{/if}
				</Button>
			</div>
			<Dialog.Footer>
				<Button
					variant="outline"
					onclick={() => {
						pairingCode = null;
						connectOpen = false;
						invalidateAll();
					}}
				>
					Done
				</Button>
			</Dialog.Footer>
		{:else}
			<!-- Step 1: select channel + agent + credential -->
			<form
				method="POST"
				action="?/generateCode"
				use:enhance={() => {
					isGenerating = true;
					return async ({ result, update }) => {
						isGenerating = false;
						await update({ reset: false });
						if (result.type === 'failure') {
							setAlert({
								type: 'error',
								title: 'Failed to generate code',
								message:
									(result.data as { error?: string })?.error ?? 'Could not generate pairing code.',
								duration: 5000,
								show: true
							});
						}
					};
				}}
				class="space-y-4"
			>
				<!-- Platform picker -->
				<div class="space-y-2">
					<Label>Platform</Label>
					<Select.Root type="single" bind:value={connectChannel} name="channel">
						<Select.Trigger class="w-full">
							{channelLabel(connectChannel)}
						</Select.Trigger>
						<Select.Content>
							{#each SUPPORTED_CHANNELS as ch}
								<Select.Item value={ch} label={channelLabel(ch)}>
									{channelLabel(ch)}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<!-- Agent picker -->
				<div class="space-y-2">
					<Label>Agent</Label>
					<Select.Root type="single" bind:value={connectAgentId} name="agentId">
						<Select.Trigger class="w-full">
							{connectAgentId
								? (data.agents.find((a) => a.id === connectAgentId)?.name ?? 'Select agent')
								: 'Select agent'}
						</Select.Trigger>
						<Select.Content>
							{#each data.agents as agent}
								<Select.Item value={agent.id} label={agent.name}>
									{agent.name}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<!-- Credential picker — shown only when the channel requires a credential -->
				{#if requiredCredentialType !== null}
					<div class="space-y-2">
						<Label>Bot credential</Label>
						{#if missingCredentials}
							<!-- No matching credentials — guide the user to create one first -->
							<div
								class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800/50 dark:bg-amber-900/20"
							>
								<p class="text-sm text-amber-700 dark:text-amber-400">
									No {channelLabel(connectChannel)} credentials found.
								</p>
								<p class="mt-1 text-xs text-amber-600 dark:text-amber-500">
									Create a {channelLabel(connectChannel)} Bot credential first, then come back here.
								</p>
							</div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								class="w-full"
								onclick={() => goto('/app/credentials')}
							>
								<ExternalLinkIcon class="mr-2 size-3.5" />
								Go to Credentials
							</Button>
						{:else}
							<Select.Root type="single" bind:value={connectCredentialId} name="credentialId">
								<Select.Trigger class="w-full">
									{connectCredentialId
										? (availableCredentials.find((c) => c.id === connectCredentialId)?.name ??
											'Select credential')
										: 'Select credential'}
								</Select.Trigger>
								<Select.Content>
									{#each availableCredentials as cred}
										<Select.Item value={cred.id} label={cred.name}>
											{cred.name}
											{#if cred.connectedAccount}
												<span class="ml-1 text-xs text-muted-foreground">
													@{cred.connectedAccount}
												</span>
											{/if}
										</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						{/if}
					</div>
				{/if}

				<Dialog.Footer>
					<Button
						variant="outline"
						type="button"
						onclick={() => (connectOpen = false)}
						disabled={isGenerating}
					>
						Cancel
					</Button>
					<Button type="submit" disabled={isGenerating || !canSubmit}>
						{isGenerating ? 'Generating…' : 'Get pairing code'}
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- ── Disconnect confirmation dialog ─────────────────────────────────────── -->
<Dialog.Root bind:open={deleteOpen}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Disconnect {channelLabel(deleteTarget?.channel ?? '')}</Dialog.Title>
			<Dialog.Description>
				This will unpair the {channelLabel(deleteTarget?.channel ?? '')} channel
				{deleteTarget?.displayName ? `(${deleteTarget.displayName})` : ''}. The bot will stop
				responding. This action cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="gap-2">
			<form
				method="POST"
				action="?/deleteLink"
				use:enhance={() => {
					isDeleting = true;
					return async ({ result, update }) => {
						isDeleting = false;
						await update({ reset: false });
						if (result.type === 'failure') {
							setAlert({
								type: 'error',
								title: 'Failed to disconnect',
								message:
									(result.data as { error?: string })?.error ?? 'Could not disconnect channel.',
								duration: 5000,
								show: true
							});
						} else {
							deleteOpen = false;
							await invalidateAll();
						}
					};
				}}
			>
				<input type="hidden" name="linkId" value={deleteTarget?.id ?? ''} />
				<div class="flex gap-2">
					<Button
						variant="outline"
						type="button"
						onclick={() => (deleteOpen = false)}
						disabled={isDeleting}
					>
						Cancel
					</Button>
					<Button variant="destructive" type="submit" disabled={isDeleting}>
						{isDeleting ? 'Disconnecting…' : 'Disconnect'}
					</Button>
				</div>
			</form>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

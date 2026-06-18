<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import RefreshIcon from '@lucide/svelte/icons/refresh-cw';
	import ResourceSelect from './ResourceSelect.svelte';
	import { api } from '$lib/api.client.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import type {
		AppTriggerProviderInfo,
		AppTriggerEventInfo,
		AppTriggerRegistrationStatus,
		AppTriggerRegistrationResponse,
		CredentialMetadata
	} from '@repo/types';

	let {
		providers,
		credentials,
		provider = $bindable(),
		event = $bindable(),
		credentialId = $bindable(),
		params = $bindable(),
		pollIntervalSec = $bindable(),
		deliveryUrl = null,
		registration = undefined,
		triggerId = null
	}: {
		providers: AppTriggerProviderInfo[];
		credentials: CredentialMetadata[];
		provider: string;
		event: string;
		credentialId: string;
		params: Record<string, unknown>;
		pollIntervalSec: number | undefined;
		deliveryUrl?: string | null;
		registration?: AppTriggerRegistrationStatus;
		/** The saved trigger id (edit mode) — enables the "re-check registration" action. */
		triggerId?: string | null;
	} = $props();

	/** Live registration status after a re-check, overriding the loaded prop when present. */
	let liveRegistration = $state<AppTriggerRegistrationStatus | undefined>(undefined);
	let rechecking = $state(false);
	const currentRegistration = $derived<AppTriggerRegistrationStatus | undefined>(
		liveRegistration ?? registration
	);

	async function recheckRegistration() {
		if (!triggerId) return;
		rechecking = true;
		try {
			const res = await api(`/app-triggers/${triggerId}/register`, { method: 'POST' });
			const body = (await res.json()) as AppTriggerRegistrationResponse;
			if (!res.ok || !body.success || !body.data) {
				throw new Error(body.error ?? 'Re-check failed.');
			}
			liveRegistration = body.data;
		} catch (err) {
			setAlert({
				type: 'error',
				title: 'Could not re-check registration',
				message: err instanceof Error ? err.message : 'Please try again.',
				duration: 6000,
				show: true
			});
		} finally {
			rechecking = false;
		}
	}

	const selectedProvider = $derived<AppTriggerProviderInfo | undefined>(
		providers.find((p) => p.id === provider)
	);
	const selectedEvent = $derived<AppTriggerEventInfo | undefined>(
		selectedProvider?.events.find((e) => e.id === event)
	);
	/** Credentials whose type is accepted by the selected provider */
	const compatibleCredentials = $derived<CredentialMetadata[]>(
		selectedProvider
			? credentials.filter((c) => selectedProvider!.compatibleCredentialTypes.includes(c.type))
			: []
	);
	const selectedCredentialName = $derived(
		compatibleCredentials.find((c) => c.id === credentialId)?.name ?? 'Select a credential'
	);

	let copiedUrl = $state(false);
	let copiedToken = $state(false);

	function selectProvider(id: string) {
		const next = providers.find((p) => p.id === id);
		if (!next) return;
		provider = id;
		// Reset event to the provider's first event and clear params/credential.
		event = next.events[0]?.id ?? '';
		params = {};
		// Keep the credential only if still compatible.
		if (!next.compatibleCredentialTypes.includes(credentialFor(credentialId))) {
			credentialId = '';
		}
	}

	function credentialFor(id: string): string {
		return credentials.find((c) => c.id === id)?.type ?? '';
	}

	function selectEvent(id: string) {
		event = id;
		params = {};
	}

	function selectCredential(id: string) {
		const prev = credentialId;
		credentialId = id;
		// A different account exposes different resources — clear any resource-typed params
		// so a stale id from the previous credential isn't carried over.
		if (prev && prev !== id && selectedEvent) {
			const next = { ...params };
			for (const field of selectedEvent.params) {
				if (field.type === 'resource') delete next[field.name];
			}
			params = next;
		}
	}

	function setParam(name: string, value: unknown) {
		params = { ...params, [name]: value };
	}

	function copyUrl() {
		if (!deliveryUrl) return;
		navigator.clipboard.writeText(deliveryUrl).then(() => {
			copiedUrl = true;
			setTimeout(() => (copiedUrl = false), 2000);
		});
	}

	function copyToken() {
		const token = currentRegistration?.verificationToken;
		if (!token) return;
		navigator.clipboard.writeText(token).then(() => {
			copiedToken = true;
			setTimeout(() => (copiedToken = false), 2000);
		});
	}
</script>

<div class="space-y-4 rounded-lg border border-border p-4">
	{#if providers.length === 0}
		<p class="text-xs text-muted-foreground">No app-trigger providers are available.</p>
	{:else}
		<!-- Provider -->
		<div class="space-y-1.5">
			<Label for="app-provider">App</Label>
			<Select.Root type="single" value={provider} onValueChange={selectProvider}>
				<Select.Trigger id="app-provider" class="w-full">
					{#if selectedProvider}
						<span class="flex items-center gap-2">
							{#if selectedProvider.icon}
								<img src={selectedProvider.icon} alt="" class="size-4" />
							{/if}
							{selectedProvider.displayName}
						</span>
					{:else}
						<span class="text-muted-foreground">Select an app</span>
					{/if}
				</Select.Trigger>
				<Select.Content>
					{#each providers as p (p.id)}
						<Select.Item value={p.id}>
							<span class="flex items-center gap-2">
								{#if p.icon}
									<img src={p.icon} alt="" class="size-4" />
								{/if}
								<span class="font-medium">{p.displayName}</span>
								<span class="ml-1 text-xs text-muted-foreground">
									— {p.deliveryMode === 'poll' ? 'polled' : p.deliveryMode}
								</span>
							</span>
						</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		{#if selectedProvider}
			<!-- Event (hidden when the provider has a single event) -->
			{#if selectedProvider.events.length > 1}
				<div class="space-y-1.5">
					<Label for="app-event">Event</Label>
					<Select.Root type="single" value={event} onValueChange={selectEvent}>
						<Select.Trigger id="app-event" class="w-full">
							{selectedEvent?.name ?? 'Select an event'}
						</Select.Trigger>
						<Select.Content>
							{#each selectedProvider.events as e (e.id)}
								<Select.Item value={e.id}>
									<span>
										<span class="font-medium">{e.name}</span>
										<span class="ml-1 text-xs text-muted-foreground">— {e.description}</span>
									</span>
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{:else if selectedEvent}
				<p class="text-xs text-muted-foreground">{selectedEvent.description}</p>
			{/if}

			<!-- Credential -->
			<div class="space-y-1.5">
				<Label for="app-credential">Credential</Label>
				{#if compatibleCredentials.length === 0}
					<p class="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
						No compatible credential found. Create a
						<span class="font-medium">{selectedProvider.displayName}</span> credential first.
					</p>
				{:else}
					<Select.Root type="single" value={credentialId} onValueChange={selectCredential}>
						<Select.Trigger id="app-credential" class="w-full">
							{selectedCredentialName}
						</Select.Trigger>
						<Select.Content>
							{#each compatibleCredentials as c (c.id)}
								<Select.Item value={c.id}>{c.name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				{/if}
			</div>

			<!-- Event params -->
			{#if selectedEvent}
				{#each selectedEvent.params as field (field.name)}
					<div class="space-y-1.5">
						{#if field.type === 'resource'}
							<Label>
								{field.label}
								{#if !field.required}
									<span class="ml-1 font-normal text-muted-foreground">(optional)</span>
								{/if}
							</Label>
							{#if !credentialId}
								<p class="text-xs text-muted-foreground">
									Select a credential first to load {field.label.toLowerCase()}.
								</p>
							{:else if field.resource}
								<ResourceSelect
									providerId={provider}
									resourceType={field.resource.type}
									{credentialId}
									multiple={field.resource.multiple ?? false}
									searchable={field.resource.searchable ?? true}
									value={params[field.name] as string | string[] | undefined}
									placeholder={field.placeholder ?? 'Select…'}
									onValueChange={(v) => setParam(field.name, v)}
								/>
							{/if}
							{#if field.description}
								<p class="text-xs text-muted-foreground">{field.description}</p>
							{/if}
						{:else if field.type === 'boolean'}
							<div class="flex items-center justify-between gap-4">
								<div class="space-y-0.5">
									<Label for={`app-param-${field.name}`} class="text-xs">{field.label}</Label>
									{#if field.description}
										<p class="text-xs text-muted-foreground">{field.description}</p>
									{/if}
								</div>
								<Switch
									id={`app-param-${field.name}`}
									checked={params[field.name] === true}
									onCheckedChange={(checked: boolean) => setParam(field.name, checked)}
									aria-label={field.label}
								/>
							</div>
						{:else if field.type === 'select'}
							<Label for={`app-param-${field.name}`}>
								{field.label}
								{#if !field.required}
									<span class="ml-1 font-normal text-muted-foreground">(optional)</span>
								{/if}
							</Label>
							<Select.Root
								type="single"
								value={String(params[field.name] ?? '')}
								onValueChange={(v) => setParam(field.name, v)}
							>
								<Select.Trigger id={`app-param-${field.name}`} class="w-full">
									{field.options?.find((o) => o.value === String(params[field.name] ?? ''))
										?.label ?? 'Select…'}
								</Select.Trigger>
								<Select.Content>
									{#each field.options ?? [] as opt (opt.value)}
										<Select.Item value={opt.value}>{opt.label}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
							{#if field.description}
								<p class="text-xs text-muted-foreground">{field.description}</p>
							{/if}
						{:else}
							<Label for={`app-param-${field.name}`}>
								{field.label}
								{#if !field.required}
									<span class="ml-1 font-normal text-muted-foreground">(optional)</span>
								{/if}
							</Label>
							<Input
								id={`app-param-${field.name}`}
								type={field.type === 'number' ? 'number' : 'text'}
								value={String(params[field.name] ?? '')}
								placeholder={field.placeholder ?? ''}
								oninput={(e) =>
									setParam(
										field.name,
										field.type === 'number' ? Number(e.currentTarget.value) : e.currentTarget.value
									)}
								class="text-sm"
							/>
							{#if field.description}
								<p class="text-xs text-muted-foreground">{field.description}</p>
							{/if}
						{/if}
					</div>
				{/each}
			{/if}

			<!-- Poll cadence (poll providers only) -->
			{#if selectedProvider.deliveryMode === 'poll'}
				<div class="space-y-1.5">
					<Label for="app-poll-interval">
						Poll interval (seconds)
						<span class="ml-1 font-normal text-muted-foreground">(optional)</span>
					</Label>
					<Input
						id="app-poll-interval"
						type="number"
						value={pollIntervalSec ?? ''}
						placeholder="60"
						oninput={(e) =>
							(pollIntervalSec = e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
						class="text-sm"
					/>
				</div>
			{/if}

			<!-- Webhook delivery URL + setup note -->
			{#if selectedProvider.deliveryMode === 'webhook'}
				{#if deliveryUrl}
					<div class="space-y-1.5">
						<Label class="text-xs">Delivery URL</Label>
						<div class="flex items-center gap-2">
							<Input type="text" value={deliveryUrl} readonly class="font-mono text-xs" />
							<Button type="button" variant="outline" size="sm" onclick={copyUrl} class="shrink-0">
								<CopyIcon class="size-4" />
								<span class="sr-only">{copiedUrl ? 'Copied!' : 'Copy URL'}</span>
							</Button>
						</div>
						<p class="text-xs text-muted-foreground">
							{#if copiedUrl}
								✓ Copied to clipboard
							{:else if currentRegistration?.mode === 'manual'}
								Add this URL to {selectedProvider.displayName} yourself (see the setup steps below), then
								re-check the registration.
							{:else}
								Valmis registers this with {selectedProvider.displayName} automatically on save. It is
								also shown here if you need it.
							{/if}
						</p>
					</div>
				{:else}
					<!-- Create mode: the trigger id (and thus the URL) doesn't exist until saved -->
					<div class="space-y-1.5">
						<Label class="text-xs text-muted-foreground">Delivery URL</Label>
						<p class="text-xs text-muted-foreground">
							Available after you <span class="font-medium">save the workflow</span>.
						</p>
					</div>
				{/if}
			{/if}

			<!-- Registration status (webhook providers, after save): error → manual → auto -->
			{#if selectedProvider.deliveryMode === 'webhook' && currentRegistration}
				<div class="space-y-1.5">
					{#if currentRegistration.error}
						<p class="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
							⚠ Setup failed: {currentRegistration.error} — fix the cause, then re-check.
						</p>
					{:else if currentRegistration.mode === 'manual'}
						<p
							class="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-500"
							role="status"
						>
							⚠ Manual setup required — Valmis can't register this with {selectedProvider.displayName}
							automatically. Add the delivery URL above in {selectedProvider.displayName} (see the setup
							steps below), then re-check.
						</p>
					{:else if currentRegistration.registeredAt}
						<p class="text-xs text-green-600 dark:text-green-500">
							✓ Registered with {selectedProvider.displayName} automatically.
						</p>
					{/if}
					{#if triggerId}
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={rechecking}
							onclick={recheckRegistration}
						>
							<RefreshIcon class="size-4 {rechecking ? 'animate-spin' : ''}" />
							{rechecking ? 'Re-checking…' : 'Re-check registration'}
						</Button>
					{/if}

					<!-- Handshake token the user must paste back into the app (e.g. Notion) -->
					{#if currentRegistration.verificationToken}
						<div class="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
							<Label class="text-xs">Verification token</Label>
							<div class="flex items-center gap-2">
								<Input
									type="text"
									value={currentRegistration.verificationToken}
									readonly
									class="font-mono text-xs"
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onclick={copyToken}
									class="shrink-0"
								>
									<CopyIcon class="size-4" />
									<span class="sr-only">{copiedToken ? 'Copied!' : 'Copy token'}</span>
								</Button>
							</div>
							<p class="text-xs text-muted-foreground">
								{#if copiedToken}
									✓ Copied to clipboard
								{:else}
									Paste this into {selectedProvider.displayName} to confirm the webhook subscription.
								{/if}
							</p>
						</div>
					{/if}
				</div>
			{/if}

			{#if selectedProvider.setupNote}
				<p class="text-xs text-muted-foreground">{selectedProvider.setupNote}</p>
			{/if}

			{#if selectedEvent?.payloadShape}
				<p class="text-xs text-muted-foreground">
					Workflow context (<code class="rounded bg-muted px-1 py-0.5">{'{{trigger.payload}}'}</code
					>):
					<code class="rounded bg-muted px-1 py-0.5">{selectedEvent.payloadShape}</code>
				</p>
			{/if}
		{/if}
	{/if}
</div>

<script lang="ts">
	import { api } from '$lib/api.client.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import { authStore } from '$lib/stores/auth.store.js';
	import { get } from 'svelte/store';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import LinkIcon from '@lucide/svelte/icons/link';
	import CheckCircleIcon from '@lucide/svelte/icons/check-circle-2';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import SearchIcon from '@lucide/svelte/icons/search';
	import CredentialConnectPanel from '$lib/components/custom/credentials/CredentialConnectPanel.svelte';
	import { connectOAuth2 } from '$lib/oauth2.js';
	import type { PageData } from './$types';
	import type { CredentialMetadata, CredentialDefinition, CredentialProperty } from '@repo/types';

	let { data }: { data: PageData } = $props();

	// Mutable local lists — synced from SSR data and updated by client-side mutations
	let credentials = $state<CredentialMetadata[]>([]);
	let definitions = $state<CredentialDefinition[]>([]);
	$effect(() => {
		credentials = data.credentials;
		definitions = data.definitions;
	});

	// ── OAuth2 callback result alert ──────────────────────────────────────────
	// Runs once when the page loads with ?oauth=success or ?oauth=error query params
	// (set by the /app/credentials/oauth2/callback redirect).
	let oauthAlertShown = $state(false);
	$effect(() => {
		if (oauthAlertShown) return;
		if (data.oauthResult === 'success') {
			oauthAlertShown = true;
			setAlert({
				type: 'success',
				title: 'Account connected',
				message: 'OAuth2 authorization completed successfully.',
				duration: 5000,
				show: true
			});
			// Refresh credentials client-side so isAuthorized and connectedAccount
			// are reflected immediately without a full page reload.
			refreshCredentials();
		} else if (data.oauthResult === 'error') {
			oauthAlertShown = true;
			setAlert({
				type: 'error',
				title: 'Connection failed',
				message: data.oauthMessage ?? 'OAuth2 authorization failed.',
				duration: 5000,
				show: true
			});
		}
	});

	// ── Create / edit credential dialog ───────────────────────────────────────
	// Create: pick a service type → fill in the form. Edit: jump straight to the
	// form pre-filled from the credential's redacted data. Once saved, the connect
	// & test panel appears inline on the same form view (not a new step).
	type DialogStep = 'pick' | 'form';

	// Sentinel the backend uses for redacted secrets. An untouched secret field is
	// submitted as this value so the server restores the stored secret — the real
	// secret is never sent to the browser. Must match CREDENTIAL_SENTINEL in
	// apps/backend/src/services/CredentialService.ts.
	const REDACTED = '__REDACTED__';

	let addDialogOpen = $state(false);
	let dialogStep = $state<DialogStep>('pick');
	let searchQuery = $state('');
	let selectedDefinition = $state<CredentialDefinition | null>(null);
	/** Dynamic form values keyed by property name */
	let formValues = $state<Record<string, string>>({});
	let credentialName = $state('');
	let isCreating = $state(false);
	let createError = $state('');
	/** The credential just created/edited — drives the connect & test step */
	let createdCredential = $state<CredentialMetadata | null>(null);
	/** Controls the "unauthorized OAuth2" confirmation dialog */
	let confirmCloseOpen = $state(false);
	/** 'create' opens with the service picker; 'edit' pre-fills an existing credential */
	let mode = $state<'create' | 'edit'>('create');
	/** Id of the credential being edited (edit mode only) */
	let editingId = $state<string | null>(null);
	/** True while loading an existing credential's data for the edit form */
	let isLoadingEditData = $state(false);
	/** Snapshot of form values + name when the edit form loaded — used to detect changes */
	let originalValues = $state<Record<string, string>>({});
	let originalName = $state('');

	/** True when a created OAuth2 credential still has no authorized account */
	let oauthUnauthorized = $derived(
		selectedDefinition?.type === 'oauth2' &&
			createdCredential != null &&
			!createdCredential.isAuthorized
	);

	/**
	 * Close handler for the connect step. An OAuth2 credential is useless without
	 * an authorized account, so finishing one that hasn't been authorized opens a
	 * confirmation dialog rather than closing silently.
	 */
	function handleDone() {
		if (oauthUnauthorized) {
			confirmCloseOpen = true;
			return;
		}
		closeAddDialog();
	}

	/** Definitions filtered by the search query */
	let filteredDefinitions = $derived(
		searchQuery.trim() === ''
			? definitions
			: definitions.filter(
					(d) =>
						d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
						d.description?.toLowerCase().includes(searchQuery.toLowerCase())
				)
	);

	function openAddDialog() {
		mode = 'create';
		editingId = null;
		dialogStep = 'pick';
		searchQuery = '';
		selectedDefinition = null;
		formValues = {};
		originalValues = {};
		originalName = '';
		credentialName = '';
		createError = '';
		createdCredential = null;
		confirmCloseOpen = false;
		isLoadingEditData = false;
		addDialogOpen = true;
	}

	/**
	 * Open the dialog in edit mode for an existing credential. Jumps straight to the
	 * form (no service picker) and pre-fills it from the credential's redacted data —
	 * secrets come back as the REDACTED sentinel and are shown as empty inputs, so the
	 * real secret never reaches the browser.
	 */
	async function openEditDialog(cred: CredentialMetadata) {
		const def = getDefinition(cred.type);
		if (!def) return;

		mode = 'edit';
		editingId = cred.id;
		dialogStep = 'form';
		selectedDefinition = def;
		credentialName = cred.name;
		originalName = cred.name;
		createError = '';
		createdCredential = null;
		confirmCloseOpen = false;
		searchQuery = '';
		formValues = {};
		originalValues = {};
		isLoadingEditData = true;
		addDialogOpen = true;

		try {
			const res = await api(`/credentials/${cred.id}/data`);
			const body = await res.json();
			const data = (body.data ?? {}) as Record<string, unknown>;

			const initial: Record<string, string> = {};
			for (const prop of def.properties) {
				if (prop.type === 'secret') {
					// Leave secrets blank — the input shows a "keep current" placeholder.
					initial[prop.name] = '';
				} else {
					const v = data[prop.name];
					initial[prop.name] = v !== undefined && v !== null ? String(v) : '';
				}
			}
			formValues = initial;
			originalValues = { ...initial };
		} catch {
			createError = 'Failed to load credential data';
		} finally {
			isLoadingEditData = false;
		}
	}

	/** Move from the service picker to the credential form */
	function selectDefinition(def: CredentialDefinition) {
		selectedDefinition = def;
		// Seed form with defaults
		const initial: Record<string, string> = {};
		for (const prop of def.properties) {
			initial[prop.name] = prop.default !== undefined ? String(prop.default) : '';
		}
		formValues = initial;
		credentialName = '';
		createError = '';
		dialogStep = 'form';
	}

	function backToPick() {
		dialogStep = 'pick';
		selectedDefinition = null;
	}

	function closeAddDialog() {
		addDialogOpen = false;
		selectedDefinition = null;
		formValues = {};
		originalValues = {};
		originalName = '';
		credentialName = '';
		createError = '';
		searchQuery = '';
		createdCredential = null;
		confirmCloseOpen = false;
		mode = 'create';
		editingId = null;
		isLoadingEditData = false;
	}

	/** Whether a given property's value differs from what was loaded into the edit form */
	function propChanged(prop: CredentialProperty): boolean {
		const current = formValues[prop.name] ?? '';
		if (prop.type === 'secret') {
			// Secrets load blank; a non-empty value means the user entered a new secret.
			return current !== '';
		}
		return current !== (originalValues[prop.name] ?? '');
	}

	/** Build the typed data payload from the form, sending untouched secrets as the sentinel */
	function buildPayload(): Record<string, unknown> {
		if (!selectedDefinition) return {};
		const payload: Record<string, unknown> = {};
		for (const prop of selectedDefinition.properties) {
			const raw = formValues[prop.name] ?? '';
			if (prop.type === 'secret' && mode === 'edit' && raw === '') {
				// Blank secret in edit mode → keep the stored value (server unredacts).
				payload[prop.name] = REDACTED;
			} else if (prop.type === 'number') {
				payload[prop.name] = raw !== '' ? Number(raw) : undefined;
			} else if (prop.type === 'boolean') {
				payload[prop.name] = raw === 'true';
			} else {
				payload[prop.name] = raw;
			}
		}
		return payload;
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!selectedDefinition) return;

		const { user } = get(authStore);
		if (!user) {
			createError = 'Not authenticated';
			return;
		}

		isCreating = true;
		createError = '';

		try {
			if (mode === 'edit' && editingId) {
				await submitEdit();
			} else {
				await submitCreate();
			}
		} catch {
			createError = 'An unexpected error occurred';
		} finally {
			isCreating = false;
		}
	}

	async function submitCreate() {
		if (!selectedDefinition) return;
		const res = await api('/credentials', {
			method: 'POST',
			body: JSON.stringify({
				name: credentialName,
				type: selectedDefinition.id,
				data: buildPayload()
			})
		});

		const body = await res.json();
		if (!res.ok) {
			createError = body.error ?? 'Failed to create credential';
			return;
		}

		const created = body.data as CredentialMetadata | undefined;
		revealConnectOrClose(created, `"${credentialName}" was created.`);
	}

	async function submitEdit() {
		if (!selectedDefinition || !editingId) return;

		const nameChanged = credentialName !== originalName;
		const dataChanged = selectedDefinition.properties.some(propChanged);

		if (!nameChanged && !dataChanged) {
			// Nothing to save.
			closeAddDialog();
			return;
		}

		// Only send `data` when a credential field actually changed — a pure rename
		// keeps the authorized account; a data change resets it (server-side).
		const payloadBody: { name: string; data?: Record<string, unknown> } = { name: credentialName };
		if (dataChanged) payloadBody.data = buildPayload();

		const res = await api(`/credentials/${editingId}`, {
			method: 'PUT',
			body: JSON.stringify(payloadBody)
		});

		const body = await res.json();
		if (!res.ok) {
			createError = body.error ?? 'Failed to update credential';
			return;
		}

		const updated = body.data as CredentialMetadata | undefined;

		// A data change de-authorizes the credential — reveal the connect & test
		// panel so the user can re-authorize / re-test. A rename keeps auth, so just close.
		if (dataChanged) {
			revealConnectOrClose(updated, 'Credential updated. Re-authorize or test the connection.');
		} else {
			closeAddDialog();
			await refreshCredentials();
			setAlert({
				type: 'success',
				title: 'Credential updated',
				message: `"${credentialName}" was renamed.`,
				duration: 5000,
				show: true
			});
		}
	}

	/**
	 * After a successful create/edit: if the credential is OAuth2 or has a test
	 * request, reveal the inline connect & test panel; otherwise close with an alert.
	 */
	function revealConnectOrClose(cred: CredentialMetadata | undefined, savedMessage: string) {
		if (!selectedDefinition) return;
		const needsConnect =
			selectedDefinition.type === 'oauth2' || Boolean(selectedDefinition.testRequest);

		if (cred && needsConnect) {
			createdCredential = cred;
			// Reflect the change in the list behind the dialog.
			refreshCredentials();
		} else {
			closeAddDialog();
			refreshCredentials();
			setAlert({
				type: 'success',
				title: 'Credential saved',
				message: savedMessage,
				duration: 5000,
				show: true
			});
		}
	}

	// ── Delete dialog ─────────────────────────────────────────────────────────
	let deleteDialogOpen = $state(false);
	let credToDelete = $state<CredentialMetadata | null>(null);
	let isDeleting = $state(false);

	function requestDelete(cred: CredentialMetadata) {
		credToDelete = cred;
		deleteDialogOpen = true;
	}

	async function confirmDelete() {
		if (!credToDelete) return;
		isDeleting = true;

		const { user } = get(authStore);
		if (!user) {
			isDeleting = false;
			return;
		}

		try {
			const res = await api(`/credentials/${credToDelete.id}`, {
				method: 'DELETE'
			});
			if (res.ok) {
				credentials = credentials.filter((c) => c.id !== credToDelete!.id);
			}
		} catch {
			// silently ignore
		} finally {
			isDeleting = false;
			deleteDialogOpen = false;
			credToDelete = null;
		}
	}

	// ── Test connection ────────────────────────────────────────────────────────
	/** Maps credential id → loading state for the test button */
	let testStatus = $state<Record<string, 'idle' | 'testing'>>({});

	async function handleTest(cred: CredentialMetadata) {
		const { user } = get(authStore);
		if (!user) return;

		testStatus[cred.id] = 'testing';

		try {
			const res = await api(`/credentials/${cred.id}/test`, {
				method: 'POST'
			});

			const body = await res.json();
			if (body.success && body.data?.valid) {
				setAlert({
					type: 'success',
					title: 'Connection successful',
					message: `Connected to "${cred.name}" (HTTP ${body.data.status})`,
					duration: 5000,
					show: true
				});
				// Refresh so connectedAccount from the test response is reflected immediately
				await refreshCredentials();
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
			testStatus[cred.id] = 'idle';
		}
	}

	// ── OAuth2 connect (popup) ───────────────────────────────────────────────────
	let oauthLoading = $state<Record<string, boolean>>({});

	async function handleOAuth2Connect(cred: CredentialMetadata) {
		const { user } = get(authStore);
		if (!user) return;

		oauthLoading[cred.id] = true;
		const result = await connectOAuth2(cred.id);
		oauthLoading[cred.id] = false;

		if (result.ok) {
			setAlert({
				type: 'success',
				title: 'Account connected',
				message: 'OAuth2 authorization completed successfully.',
				duration: 5000,
				show: true
			});
			await refreshCredentials();
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

	// ── Helpers ────────────────────────────────────────────────────────────────
	async function refreshCredentials() {
		const { user } = get(authStore);
		if (!user) return;
		try {
			const res = await api('/credentials');
			if (res.ok) {
				const body = await res.json();
				credentials = (body.data ?? []) as CredentialMetadata[];
			}
		} catch {
			// silently ignore
		}
	}

	function getDefinition(type: string): CredentialDefinition | undefined {
		return definitions.find((d) => d.id === type);
	}

	function formatDate(iso: string | Date): string {
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function typeLabel(type: string): string {
		return getDefinition(type)?.name ?? type;
	}

	function isOAuth2(type: string): boolean {
		return getDefinition(type)?.type === 'oauth2';
	}

	/** Returns the icon path for a credential type, or null to show the fallback */
	function getIcon(type: string): string | null {
		return getDefinition(type)?.icon ?? null;
	}

	function hasTestRequest(type: string): boolean {
		return Boolean(getDefinition(type)?.testRequest);
	}

	function inputType(prop: CredentialProperty): string {
		if (prop.type === 'secret') return 'password';
		if (prop.type === 'number') return 'number';
		return 'text';
	}
</script>

<svelte:head>
	<title>Credentials — Valmis Dashboard</title>
	<meta
		name="description"
		content="Manage service credentials and API connections for your Valmis integrations. Set up API keys, OAuth2 accounts, and more."
	/>
	<meta
		name="keywords"
		content="credentials, API keys, OAuth2, integrations, service connections, Valmis"
	/>
</svelte:head>

<!-- ── Delete confirmation dialog ───────────────────────────────────────── -->
<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete credential</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to delete <span class="font-medium text-foreground"
					>{credToDelete?.name}</span
				>? Any integrations using this credential will stop working.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="gap-2 sm:gap-0">
			<Button
				variant="outline"
				onclick={() => {
					deleteDialogOpen = false;
					credToDelete = null;
				}}
				disabled={isDeleting}
			>
				Cancel
			</Button>
			<Button variant="destructive" onclick={confirmDelete} disabled={isDeleting}>
				{isDeleting ? 'Deleting…' : 'Delete credential'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- ── Unauthorized OAuth2 close confirmation ───────────────────────────── -->
<Dialog.Root bind:open={confirmCloseOpen}>
	<!-- z-60 keeps this above the create dialog (z-50) it is layered on top of -->
	<Dialog.Content class="z-60 sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Account not connected</Dialog.Title>
			<Dialog.Description>
				This credential won't work until you connect an account. Authorize an account now, or close
				anyway to finish without it.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="gap-2 sm:gap-0">
			<Button variant="outline" onclick={closeAddDialog}>Close anyway</Button>
			<Button onclick={() => (confirmCloseOpen = false)}>Go back to authorize</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- ── Add credential dialog (multi-step) ───────────────────────────────── -->
<Dialog.Root
	bind:open={addDialogOpen}
	onOpenChange={(open: boolean) => {
		if (!open) closeAddDialog();
	}}
>
	<Dialog.Content class="sm:max-w-2xl">
		{#if dialogStep === 'pick'}
			<!-- Step 1: service picker -->
			<Dialog.Header>
				<Dialog.Title>Add credential</Dialog.Title>
				<Dialog.Description>Select the service you want to connect to.</Dialog.Description>
			</Dialog.Header>

			<!-- Search box -->
			<div class="relative">
				<SearchIcon class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input type="text" placeholder="Search services…" bind:value={searchQuery} class="pl-9" />
			</div>

			<!-- Service list -->
			<div class="max-h-72 overflow-y-auto rounded-md border border-border">
				{#if filteredDefinitions.length === 0}
					<p class="py-8 text-center text-sm text-muted-foreground">No services found.</p>
				{:else}
					<ul class="divide-y divide-border">
						{#each filteredDefinitions as def (def.id)}
							<li>
								<button
									type="button"
									onclick={() => selectDefinition(def)}
									class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
								>
									<div
										class="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
									>
										{#if def.icon}
											<img src={def.icon} alt={def.name} class="size-5 object-contain" />
										{:else}
											<ShieldIcon class="size-4" />
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<p class="text-sm font-medium text-foreground">{def.name}</p>
										{#if def.description}
											<p class="truncate text-xs text-muted-foreground">{def.description}</p>
										{/if}
									</div>
									<Badge variant="secondary" class="shrink-0 text-xs capitalize">{def.type}</Badge>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<Dialog.Footer>
				<Button variant="outline" onclick={closeAddDialog}>Cancel</Button>
			</Dialog.Footer>
		{:else if dialogStep === 'form' && selectedDefinition}
			<!-- Step 2: credential form -->
			<Dialog.Header>
				<div class="flex items-center gap-2">
					{#if !createdCredential && mode !== 'edit'}
						<Button
							variant="ghost"
							size="sm"
							onclick={backToPick}
							class="-ml-1 h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
							aria-label="Back to service picker"
						>
							<ChevronLeftIcon class="size-4" />
						</Button>
					{/if}
					<Dialog.Title>
						{mode === 'edit' ? `Edit ${selectedDefinition.name}` : selectedDefinition.name}
					</Dialog.Title>
				</div>
				{#if selectedDefinition.description}
					<Dialog.Description class={mode === 'edit' ? '' : 'pl-9'}>
						{selectedDefinition.description}
					</Dialog.Description>
				{/if}
			</Dialog.Header>

			<form onsubmit={handleSubmit} class="space-y-4">
				<!-- Scrollable field area so a long form never exceeds the viewport (the footer
				     stays pinned below). -mx-1/px-1 give focus rings room without shifting layout. -->
				<div class="-mx-1 max-h-[60vh] space-y-4 overflow-y-auto px-1">
					{#if createError}
						<p class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
							{createError}
						</p>
					{/if}

					{#if isLoadingEditData}
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							<LoaderIcon class="size-4 animate-spin" />
							Loading credential…
						</div>
					{/if}

					<!-- OAuth2: show the callback URL the user must register with their OAuth provider -->
					{#if selectedDefinition.type === 'oauth2' && data.oauthCallbackUrl}
						<div class="space-y-1.5">
							<Label for="callbackUrl">Authorized redirect URI</Label>
							<Input
								id="callbackUrl"
								type="text"
								value={data.oauthCallbackUrl}
								readonly
								class="cursor-default bg-muted font-mono text-xs text-muted-foreground select-all"
							/>
							<p class="text-xs text-muted-foreground">
								Add this URL as an authorized redirect URI in your OAuth provider's console.
							</p>
						</div>
					{/if}

					<!-- User-facing label for this credential instance -->
					<div class="space-y-1.5">
						<Label for="credName">Credential name</Label>
						<Input
							id="credName"
							type="text"
							bind:value={credentialName}
							required
							disabled={Boolean(createdCredential) || isLoadingEditData}
							placeholder="e.g. My {selectedDefinition.name} account"
						/>
						<p class="text-xs text-muted-foreground">
							A label to identify this credential in the dashboard.
						</p>
					</div>

					<!-- Dynamic property fields from the definition -->
					{#each selectedDefinition.properties as prop (prop.name)}
						<div class="space-y-1.5">
							<Label for={`prop-${prop.name}`}>
								{prop.displayName}{prop.required ? '' : ' (optional)'}
							</Label>

							{#if prop.type === 'options' && prop.options}
								<select
									id={`prop-${prop.name}`}
									bind:value={formValues[prop.name]}
									disabled={Boolean(createdCredential) || isLoadingEditData}
									class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
								>
									{#each prop.options as opt (opt.value)}
										<option value={String(opt.value)}>{opt.name}</option>
									{/each}
								</select>
							{:else if prop.type === 'boolean'}
								<select
									id={`prop-${prop.name}`}
									bind:value={formValues[prop.name]}
									disabled={Boolean(createdCredential) || isLoadingEditData}
									class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
								>
									<option value="true">Yes</option>
									<option value="false">No</option>
								</select>
							{:else}
								<Input
									id={`prop-${prop.name}`}
									type={inputType(prop)}
									bind:value={formValues[prop.name]}
									required={prop.required && !(mode === 'edit' && prop.type === 'secret')}
									disabled={Boolean(createdCredential) || isLoadingEditData}
									placeholder={mode === 'edit' && prop.type === 'secret'
										? 'Leave blank to keep current value'
										: undefined}
								/>
							{/if}

							{#if prop.description && prop.type !== 'options' && prop.type !== 'boolean'}
								<p class="text-xs text-muted-foreground">{prop.description}</p>
							{/if}
						</div>
					{/each}

					{#if selectedDefinition.documentationUrl}
						<p class="text-xs text-muted-foreground">
							<a
								href={selectedDefinition.documentationUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="underline underline-offset-2 hover:text-foreground"
							>
								View documentation
							</a>
						</p>
					{/if}

					<!-- Connect & test — appears inline once the credential is saved -->
					{#if createdCredential}
						<Separator />
						<div class="space-y-1">
							<h3 class="text-sm font-medium text-foreground">Connect &amp; test</h3>
							<p class="text-xs text-muted-foreground">
								{#if selectedDefinition.type === 'oauth2'}
									Connect your account, then test the connection.
								{:else}
									Test the connection to make sure it works.
								{/if}
							</p>
						</div>
						<CredentialConnectPanel
							credential={createdCredential}
							definition={selectedDefinition}
							onUpdated={(c) => {
								createdCredential = c;
								if (c.isAuthorized) confirmCloseOpen = false;
								refreshCredentials();
							}}
						/>
					{/if}
				</div>

				<Dialog.Footer class="pt-2">
					{#if createdCredential}
						<Button type="button" onclick={handleDone}>Done</Button>
					{:else}
						<Button type="button" variant="outline" onclick={closeAddDialog} disabled={isCreating}>
							Cancel
						</Button>
						<Button type="submit" disabled={isCreating || isLoadingEditData}>
							{#if isCreating}
								Saving…
							{:else if mode === 'edit'}
								Save changes
							{:else}
								Save credential
							{/if}
						</Button>
					{/if}
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- ── Page ─────────────────────────────────────────────────────────────── -->
<PageHeader
	title="Credentials"
	description="Store API keys, tokens, and OAuth2 accounts for use in your integrations."
>
	{#snippet actions()}
		<Button onclick={openAddDialog} class="gap-2">
			<PlusIcon class="size-4" />
			Add credential
		</Button>
	{/snippet}
</PageHeader>

<!-- Credentials list -->
<Card.Root>
	<Card.Header class="pb-3">
		<Card.Title class="text-sm font-medium">Your credentials</Card.Title>
		<Card.Description class="text-xs">
			{credentials.length} credential{credentials.length !== 1 ? 's' : ''} configured
		</Card.Description>
	</Card.Header>

	{#if credentials.length === 0}
		<Card.Content>
			<div class="flex flex-col items-center gap-3 py-10">
				<div
					class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
				>
					<ShieldIcon class="size-5" />
				</div>
				<p class="text-sm text-muted-foreground">No credentials yet.</p>
				<Button variant="outline" size="sm" onclick={openAddDialog} class="gap-2">
					<PlusIcon class="size-4" />
					Add your first credential
				</Button>
			</div>
		</Card.Content>
	{:else}
		<Card.Content class="p-0">
			<ul class="divide-y divide-border">
				{#each credentials as cred (cred.id)}
					{@const status = testStatus[cred.id] ?? 'idle'}
					<li
						class="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
					>
						<!-- Identity: icon + name + badges + date -->
						<div class="flex min-w-0 flex-1 items-start gap-3">
							<div
								class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
							>
								{#if getIcon(cred.type)}
									<img
										src={getIcon(cred.type)}
										alt={typeLabel(cred.type)}
										class="size-4 object-contain"
									/>
								{:else}
									<ShieldIcon class="size-3.5" />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-1.5">
									<p class="truncate text-sm font-medium text-foreground">{cred.name}</p>
									<Badge variant="secondary" class="shrink-0 px-1.5 py-0 text-[10px]"
										>{typeLabel(cred.type)}</Badge
									>
									{#if isOAuth2(cred.type)}
										<Badge variant="outline" class="shrink-0 px-1.5 py-0 text-[10px]">OAuth2</Badge>
									{/if}
								</div>
								<p class="mt-0.5 text-xs text-muted-foreground">
									Created {formatDate(cred.createdAt)}
								</p>
							</div>
						</div>

						<!-- Actions: wraps on mobile, row on desktop -->
						<div class="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:flex-nowrap">
							{#if isOAuth2(cred.type)}
								<!-- OAuth2: show authorized account + connect/re-authorize button -->
								{#if cred.isAuthorized}
									<div class="flex items-center gap-1.5">
										<CheckCircleIcon class="size-3 shrink-0 text-green-500" />
										<span class="max-w-40 truncate text-xs text-muted-foreground">
											{cred.connectedAccount ?? 'Connected'}
										</span>
									</div>
								{/if}
								<Button
									variant="outline"
									size="xs"
									onclick={() => handleOAuth2Connect(cred)}
									disabled={oauthLoading[cred.id]}
									class="gap-1.5 text-xs"
								>
									{#if oauthLoading[cred.id]}
										<LoaderIcon class="size-3.5 animate-spin" />
										Connecting…
									{:else}
										<LinkIcon class="size-3.5" />
										{cred.isAuthorized ? 'Re-authorize' : 'Connect account'}
									{/if}
								</Button>
							{:else if cred.connectedAccount}
								<!-- Non-OAuth2: show account identifier populated by a previous test -->
								<div class="flex items-center gap-1.5">
									<CheckCircleIcon class="size-3 shrink-0 text-green-500" />
									<span class="max-w-40 truncate text-xs text-muted-foreground">
										{cred.connectedAccount}
									</span>
								</div>
							{/if}

							{#if hasTestRequest(cred.type)}
								<!-- Test connection -->
								<Button
									variant="outline"
									size="xs"
									onclick={() => handleTest(cred)}
									disabled={status === 'testing'}
									class="gap-1.5 text-xs"
								>
									{#if status === 'testing'}
										<LoaderIcon class="size-3.5 animate-spin" />
										Testing…
									{:else}
										<CheckCircleIcon class="size-3.5" />
										Test
									{/if}
								</Button>
							{/if}

							<!-- Edit — opens the dialog pre-filled (secrets stay redacted) -->
							<Button
								variant="outline"
								size="xs"
								onclick={() => openEditDialog(cred)}
								class="ml-auto gap-1.5 text-xs sm:ml-0"
							>
								<PencilIcon class="size-3.5" />
								Edit
							</Button>

							<!-- Delete — pushed to end, icon only -->
							<Button
								variant="ghost"
								size="xs"
								onclick={() => requestDelete(cred)}
								class="text-destructive hover:bg-destructive/10 hover:text-destructive"
							>
								<TrashIcon class="size-4" />
								<span class="sr-only">Delete {cred.name}</span>
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		</Card.Content>
	{/if}
</Card.Root>

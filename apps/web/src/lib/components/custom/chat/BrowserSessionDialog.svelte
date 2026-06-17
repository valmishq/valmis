<script lang="ts">
	import { api } from '$lib/api.client.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import HistoryIcon from '@lucide/svelte/icons/history';
	import PowerIcon from '@lucide/svelte/icons/power';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import type { BrowserSessionStatus, BrowserHistoryEntry } from '@repo/types';

	let {
		open = $bindable(false),
		agentId,
		agentName = '',
		threadId
	}: {
		open: boolean;
		agentId: string;
		agentName?: string;
		threadId?: string;
	} = $props();

	let status = $state<BrowserSessionStatus | null>(null);
	let history = $state<BrowserHistoryEntry[] | null>(null);
	let loading = $state(false);
	let busy = $state(false);
	let loadError = $state<string | null>(null);
	let showHistory = $state(false);
	/** Which destructive action is awaiting an inline second click. */
	let pendingConfirm = $state<string | null>(null);

	const base = $derived(`/agents/${agentId}/browser`);

	/** Re-fetch status whenever the dialog opens for a thread. */
	$effect(() => {
		if (open && agentId) {
			void refresh();
		} else if (!open) {
			// reset transient UI state on close
			showHistory = false;
			pendingConfirm = null;
			history = null;
		}
	});

	async function refresh() {
		loading = true;
		loadError = null;
		try {
			const res = await api(base);
			if (res.ok) {
				const body = await res.json();
				status = body.data as BrowserSessionStatus;
			} else {
				loadError = 'Could not load browser status.';
			}
		} catch {
			loadError = 'Could not load browser status.';
		} finally {
			loading = false;
		}
	}

	async function loadHistory() {
		showHistory = true;
		try {
			const res = await api(`${base}/history`);
			if (res.ok) {
				const body = await res.json();
				history = (body.data ?? []) as BrowserHistoryEntry[];
			} else {
				history = [];
			}
		} catch {
			history = [];
		}
	}

	/** Run a destructive action behind an inline two-step confirm. */
	async function runAction(key: string, path: string, successMsg: string) {
		if (pendingConfirm !== key) {
			pendingConfirm = key;
			return;
		}
		pendingConfirm = null;
		busy = true;
		try {
			const res = await api(path, { method: 'DELETE' });
			if (res.ok) {
				setAlert({ type: 'success', title: 'Done', message: successMsg, duration: 4000, show: true });
				if (key === 'history' || key === 'reset') history = null;
				await refresh();
			} else {
				const body = await res.json().catch(() => ({}));
				setAlert({
					type: 'error',
					title: 'Action failed',
					message: (body as { error?: string }).error ?? 'The browser action could not be completed.',
					duration: 5000,
					show: true
				});
			}
		} catch {
			setAlert({
				type: 'error',
				title: 'Action failed',
				message: 'An unexpected error occurred.',
				duration: 5000,
				show: true
			});
		} finally {
			busy = false;
		}
	}

	function confirmLabel(key: string, label: string): string {
		return pendingConfirm === key ? 'Click again to confirm' : label;
	}

	function formatTime(iso?: string): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<GlobeIcon class="size-4" />
				Browser session
			</Dialog.Title>
			<Dialog.Description>
				Manage the browser for {agentName || 'this agent'}. Saved logins and history are shared
				across this agent's conversations.
			</Dialog.Description>
		</Dialog.Header>

		{#if loading && !status}
			<div class="flex items-center justify-center py-10 text-muted-foreground">
				<LoaderCircleIcon class="size-5 animate-spin" />
			</div>
		{:else if loadError}
			<div
				class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
				role="alert"
			>
				{loadError}
			</div>
		{:else if status && !status.browserAvailable}
			<div class="rounded-md border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
				Browser access is not available for this agent. It requires the agent's internet access to
				be enabled and the browser feature to be turned on for this deployment.
			</div>
		{:else if status}
			<!-- min-w-0 caps the dialog's grid track (its items default to min-width:auto,
			     so a long URL / badge row would otherwise blow it past the dialog edge);
			     overflow guards clip + scroll long content. -->
			<div class="max-h-[60vh] min-w-0 space-y-3 overflow-x-hidden overflow-y-auto pr-0.5">
				<!-- Active session -->
				<div class="min-w-0 rounded-md border border-border p-3">
					<div class="flex items-center gap-2">
						<PowerIcon class="size-4 text-muted-foreground" />
						<span class="text-sm font-medium text-foreground">Active session</span>
					</div>
					{#if status.activeSessions.length > 0}
						{@const s = status.activeSessions.find((a) => a.threadId === threadId) ?? status.activeSessions[0]}
						<div class="mt-1.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
							<span class="truncate" title={s.url}>{s.url || 'about:blank'}</span>
							<span class="shrink-0">· idle {s.idleSeconds}s</span>
						</div>
						<Button
							variant="outline"
							size="sm"
							class="mt-2 gap-2"
							disabled={busy}
							onclick={() =>
								runAction(
									'close',
									`${base}/session${threadId ? `?threadId=${threadId}` : ''}`,
									'Browser session closed.'
								)}
						>
							{confirmLabel('close', 'Close session')}
						</Button>
					{:else}
						<p class="mt-1.5 text-xs text-muted-foreground">
							No active browser session for this conversation.
						</p>
					{/if}
				</div>

				<!-- Saved logins & cookies -->
				<div class="min-w-0 rounded-md border border-border p-3">
					<div class="flex items-center gap-2">
						<KeyRoundIcon class="size-4 text-muted-foreground" />
						<span class="text-sm font-medium text-foreground">Saved logins & cookies</span>
					</div>
					{#if status.persisted.exists}
						<p class="mt-1.5 text-xs text-muted-foreground">
							{status.persisted.cookieCount} cookie(s) · saved {formatTime(status.persisted.lastSavedAt)}
						</p>
						{#if status.persisted.origins.length > 0}
							<div class="mt-2 flex min-w-0 flex-wrap gap-1">
								{#each status.persisted.origins as origin (origin)}
									<Badge variant="secondary" class="max-w-full truncate text-xs">{origin}</Badge>
								{/each}
							</div>
						{/if}
						<Button
							variant="outline"
							size="sm"
							class="mt-2 gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
							disabled={busy}
							onclick={() =>
								runAction('logins', `${base}/data`, 'Saved logins and cookies cleared.')}
						>
							{confirmLabel('logins', 'Clear saved logins & cookies')}
						</Button>
					{:else}
						<p class="mt-1.5 text-xs text-muted-foreground">No saved login data.</p>
					{/if}
				</div>

				<!-- History -->
				<div class="min-w-0 rounded-md border border-border p-3">
					<div class="flex items-center justify-between gap-2">
						<div class="flex items-center gap-2">
							<HistoryIcon class="size-4 text-muted-foreground" />
							<span class="text-sm font-medium text-foreground">History</span>
							<span class="text-xs text-muted-foreground">({status.history.count})</span>
						</div>
						{#if status.history.count > 0 && !showHistory}
							<Button variant="ghost" size="sm" onclick={loadHistory}>View</Button>
						{/if}
					</div>
					{#if showHistory}
						{#if history === null}
							<div class="flex justify-center py-3 text-muted-foreground">
								<LoaderCircleIcon class="size-4 animate-spin" />
							</div>
						{:else if history.length === 0}
							<p class="mt-1.5 text-xs text-muted-foreground">No history recorded.</p>
						{:else}
							<ScrollArea class="mt-2 h-40 rounded-md border border-border">
								<div class="divide-y divide-border/40">
									{#each history as entry (entry.visitedAt + entry.url)}
										<div class="min-w-0 px-2.5 py-1.5">
											<p class="truncate text-xs font-medium text-foreground" title={entry.title}>
												{entry.title || entry.url}
											</p>
											<p class="truncate text-[11px] text-muted-foreground" title={entry.url}>
												{entry.url} · {formatTime(entry.visitedAt)}
											</p>
										</div>
									{/each}
								</div>
							</ScrollArea>
						{/if}
					{/if}
					{#if status.history.count > 0}
						<Button
							variant="outline"
							size="sm"
							class="mt-2 gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
							disabled={busy}
							onclick={() => runAction('history', `${base}/history`, 'History cleared.')}
						>
							{confirmLabel('history', 'Clear history')}
						</Button>
					{:else}
						<p class="mt-1.5 text-xs text-muted-foreground">No history recorded.</p>
					{/if}
				</div>
			</div>

			<Dialog.Footer class="gap-2 sm:gap-0">
				<Button
					variant="destructive"
					class="gap-2"
					disabled={busy}
					onclick={() =>
						runAction('reset', base, 'Browser reset — session, logins and history cleared.')}
				>
					<RotateCcwIcon class="size-4" />
					{confirmLabel('reset', 'Reset everything')}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>

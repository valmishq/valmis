<script lang="ts">
	import { untrack } from 'svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { cn } from '$lib/utils.js';
	import { api } from '$lib/api.client.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import XIcon from '@lucide/svelte/icons/x';
	import type { AppTriggerResourceOption, AppTriggerResourcesResponse } from '@repo/types';

	let {
		providerId,
		resourceType,
		credentialId,
		multiple = false,
		searchable = true,
		value,
		placeholder = 'Select…',
		onValueChange
	}: {
		providerId: string;
		resourceType: string;
		credentialId: string;
		multiple?: boolean;
		searchable?: boolean;
		/** Current value: scalar string (single) or string[] (multiple). */
		value: string | string[] | undefined;
		placeholder?: string;
		/** Emits the new value — scalar for single-select, array for multi-select. */
		onValueChange: (value: string | string[]) => void;
	} = $props();

	let open = $state(false);
	let options = $state<AppTriggerResourceOption[]>([]);
	/** Resolves an id → human label even after the option scrolls out of the loaded page. */
	let labelCache = $state<Record<string, string>>({});
	let loading = $state(false);
	let loadedOnce = $state(false);
	let search = $state('');
	let manualValue = $state('');
	let nextCursor = $state<string | undefined>(undefined);

	/** The current selection normalized to a string[] regardless of single/multi. */
	const selected = $derived<string[]>(
		Array.isArray(value) ? value : value ? [value] : []
	);

	const labelFor = (id: string): string => labelCache[id] ?? id;

	async function fetchPage(reset: boolean) {
		if (!credentialId) return;
		loading = true;
		try {
			const qs = new URLSearchParams({ resourceType, credentialId });
			if (search.trim()) qs.set('search', search.trim());
			if (!reset && nextCursor) qs.set('cursor', nextCursor);

			const res = await api(`/app-triggers/${providerId}/resources?${qs.toString()}`);
			const body = (await res.json()) as AppTriggerResourcesResponse;
			if (!res.ok || !body.success || !body.data) {
				throw new Error(body.error ?? 'Failed to load options.');
			}

			const page = body.data;
			options = reset ? page.options : [...options, ...page.options];
			nextCursor = page.nextCursor;
			const cache = { ...labelCache };
			for (const opt of page.options) cache[opt.value] = opt.label;
			labelCache = cache;
			loadedOnce = true;
		} catch (err) {
			setAlert({
				type: 'error',
				title: 'Could not load options',
				message:
					err instanceof Error ? err.message : 'Please try again, or enter an id manually below.',
				duration: 6000,
				show: true
			});
		} finally {
			loading = false;
		}
	}

	// Reset cached options whenever the credential or resource kind changes — a different
	// account exposes different ids/labels.
	$effect(() => {
		credentialId;
		resourceType;
		untrack(() => {
			options = [];
			labelCache = {};
			nextCursor = undefined;
			loadedOnce = false;
			search = '';
		});
	});

	// Lazy-load on first open, and resolve labels for an existing selection (edit mode).
	$effect(() => {
		if (!credentialId || loadedOnce || loading) return;
		if (open || selected.length > 0) {
			untrack(() => fetchPage(true));
		}
	});

	// Debounced server-side search — `search` is the only reactive dependency here.
	$effect(() => {
		if (!searchable) return;
		const current = search;
		const handle = setTimeout(() => {
			untrack(() => {
				if (open && credentialId && loadedOnce && search === current) fetchPage(true);
			});
		}, 400);
		return () => clearTimeout(handle);
	});

	function toggle(id: string) {
		if (multiple) {
			const set = new Set(selected);
			if (set.has(id)) set.delete(id);
			else set.add(id);
			onValueChange([...set]);
		} else {
			onValueChange(id);
			open = false;
		}
	}

	function remove(id: string) {
		if (multiple) onValueChange(selected.filter((v) => v !== id));
		else onValueChange('');
	}

	function addManual() {
		const v = manualValue.trim();
		if (!v) return;
		if (!labelCache[v]) labelCache = { ...labelCache, [v]: v };
		if (multiple) {
			if (!selected.includes(v)) onValueChange([...selected, v]);
		} else {
			onValueChange(v);
			open = false;
		}
		manualValue = '';
	}
</script>

<div class="space-y-2">
	{#if multiple && selected.length > 0}
		<div class="flex flex-wrap gap-1.5">
			{#each selected as id (id)}
				<Badge variant="secondary" class="gap-1 pr-1">
					<span class="max-w-56 truncate">{labelFor(id)}</span>
					<button
						type="button"
						onclick={() => remove(id)}
						class="rounded-sm opacity-70 transition-opacity hover:opacity-100"
						aria-label={`Remove ${labelFor(id)}`}
					>
						<XIcon class="size-3" />
					</button>
				</Badge>
			{/each}
		</div>
	{/if}

	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props }: { props: Record<string, unknown> })}
				<Button
					{...props}
					variant="outline"
					role="combobox"
					aria-expanded={open}
					class="w-full justify-between font-normal"
				>
					<span class="truncate">
						{#if !multiple && selected.length > 0}
							{labelFor(selected[0])}
						{:else}
							<span class="text-muted-foreground">{placeholder}</span>
						{/if}
					</span>
					<ChevronsUpDownIcon class="ml-2 size-4 shrink-0 opacity-50" />
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-[var(--bits-popover-anchor-width)] p-0" align="start">
			<Command.Root shouldFilter={false}>
				{#if searchable}
					<Command.Input placeholder="Search…" bind:value={search} />
				{/if}
				<Command.List class="max-h-60">
					{#if loading && options.length === 0}
						<div class="p-3 text-center text-sm text-muted-foreground">Loading…</div>
					{:else if options.length === 0}
						<Command.Empty>No matches.</Command.Empty>
					{/if}
					<Command.Group>
						{#each options as opt (opt.value)}
							<Command.Item value={opt.value} onSelect={() => toggle(opt.value)}>
								<CheckIcon
									class={cn(
										'mr-2 size-4 shrink-0',
										!selected.includes(opt.value) && 'text-transparent'
									)}
								/>
								<span class="flex-1 truncate">{opt.label}</span>
								{#if opt.description}
									<span class="ml-2 shrink-0 text-xs text-muted-foreground">{opt.description}</span>
								{/if}
							</Command.Item>
						{/each}
					</Command.Group>
					{#if nextCursor}
						<div class="p-1">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								class="w-full"
								disabled={loading}
								onclick={() => fetchPage(false)}
							>
								{loading ? 'Loading…' : 'Load more'}
							</Button>
						</div>
					{/if}
				</Command.List>
			</Command.Root>
			<div class="space-y-1.5 border-t border-border p-2">
				<p class="text-xs text-muted-foreground">Can't find it? Enter an id manually.</p>
				<div class="flex gap-2">
					<Input
						bind:value={manualValue}
						placeholder="Paste an id…"
						class="h-8 text-xs"
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								addManual();
							}
						}}
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						class="shrink-0"
						disabled={!manualValue.trim()}
						onclick={addManual}
					>
						Add
					</Button>
				</div>
			</div>
		</Popover.Content>
	</Popover.Root>
</div>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api.client.js';
	import ChatThreadSidebar from '$lib/components/custom/chat/ChatThreadSidebar.svelte';
	import BrowserSessionDialog from '$lib/components/custom/chat/BrowserSessionDialog.svelte';
	import AgentAvatar from '$lib/components/custom/chat/AgentAvatar.svelte';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import type { PageData } from './$types';
	import type { AgentThread } from '@repo/types';
	import MessageSquarePlusIcon from '@lucide/svelte/icons/message-square-plus';

	let { data }: { data: PageData } = $props();

	// $derived keeps the list in sync when invalidateAll() refreshes page data
	// (e.g. when the workflow-thread toggle triggers a reload via invalidateAll).
	// The sidebar mutates threads via $bindable for optimistic pin updates.
	let threads = $state(data.threads);
	$effect(() => {
		threads = data.threads;
	});
	let isCreatingThread = $state(false);
	/** Mobile sidebar overlay open state */
	let sidebarOpen = $state(false);

	let browserDialogOpen = $state(false);
	let browserThreadTarget = $state<AgentThread | null>(null);
	function handleBrowserSession(thread: AgentThread) {
		browserThreadTarget = thread;
		browserDialogOpen = true;
	}

	/** Create a new thread and redirect to the chat view. */
	async function handleNewChat() {
		isCreatingThread = true;
		try {
			const res = await api(`/runtime/${data.agent.id}/threads`, {
				method: 'POST',
				body: JSON.stringify({ title: 'New conversation' })
			});

			if (!res.ok) {
				const body = await res.json();
				setAlert({
					type: 'error',
					title: 'Failed to start chat',
					message: body.error ?? 'Could not create a new conversation.',
					duration: 5000,
					show: true
				});
				return;
			}

			const body = await res.json();
			const thread = body.data as AgentThread;
			goto(`/app/chat/${data.agent.id}/${thread.id}`);
		} catch {
			setAlert({
				type: 'error',
				title: 'Failed to start chat',
				message: 'An unexpected error occurred.',
				duration: 5000,
				show: true
			});
		} finally {
			isCreatingThread = false;
		}
	}
</script>

<svelte:head>
	<title>{data.agent.name} — Chat — AgentInt</title>
	<meta
		name="description"
		content="Chat with {data.agent.name}. Start a new conversation or continue a previous one."
	/>
</svelte:head>

<div class="flex h-full overflow-hidden">
	<!-- Left panel: thread list -->
	<ChatThreadSidebar
		agent={data.agent}
		{threads}
		{isCreatingThread}
		bind:open={sidebarOpen}
		browserAvailable={data.browserAvailable}
		onNewChat={handleNewChat}
		onRenameThread={() => {}}
		onDeleteThread={() => {}}
		onBrowserSession={handleBrowserSession}
	/>

	<!-- Right panel: empty state -->
	<div class="relative flex flex-1 flex-col bg-background">
		<div class="flex flex-1 flex-col items-center justify-center gap-5 px-6">
			<div class="flex flex-col items-center gap-4 text-center">
				<AgentAvatar avatarUrl={data.agent.avatarUrl} name={data.agent.name} size="lg" />
				<div>
					<h2 class="text-lg font-semibold text-foreground">{data.agent.name}</h2>
					{#if data.agent.description}
						<p class="mt-1 max-w-xs text-sm text-muted-foreground">{data.agent.description}</p>
					{/if}
				</div>
			</div>

			<div class="flex flex-col items-center gap-3">
				<p class="text-sm text-muted-foreground">
					{#if threads.length === 0}
						No conversations yet. Start one below.
					{:else}
						Select a conversation or start a new one.
					{/if}
				</p>

				<button
					type="button"
					class="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-medium
						text-foreground shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.98]
						disabled:pointer-events-none disabled:opacity-50"
					onclick={handleNewChat}
					disabled={isCreatingThread}
				>
					<MessageSquarePlusIcon class="size-4" />
					{isCreatingThread ? 'Starting…' : 'Start new conversation'}
				</button>
			</div>
		</div>
	</div>
</div>

<!-- Browser session management modal -->
<BrowserSessionDialog
	bind:open={browserDialogOpen}
	agentId={data.agent.id}
	agentName={data.agent.name}
	threadId={browserThreadTarget?.id}
/>

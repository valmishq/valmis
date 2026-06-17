<script lang="ts">
	import BotIcon from '@lucide/svelte/icons/bot';
	import ZapIcon from '@lucide/svelte/icons/zap';
	import KeyIcon from '@lucide/svelte/icons/key';
	import FileTextIcon from '@lucide/svelte/icons/file-text';

	/** Workspace count tiles. Each links to its management section. */
	let {
		agentCount,
		workflowCount,
		credentialCount,
		knowledgeCount
	}: {
		agentCount: number;
		workflowCount: number;
		credentialCount: number;
		knowledgeCount: number;
	} = $props();

	const stats = $derived([
		{ label: 'Agents', value: agentCount, href: '/app/agents', icon: BotIcon },
		{ label: 'Workflows', value: workflowCount, href: '/app/workflows', icon: ZapIcon },
		{ label: 'Credentials', value: credentialCount, href: '/app/credentials', icon: KeyIcon },
		{ label: 'Knowledge files', value: knowledgeCount, href: '/app/knowledge', icon: FileTextIcon }
	]);
</script>

<!-- Cards match the agent cards on the chat page (border + shadow-sm + hover/active). -->
<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
	{#each stats as stat (stat.label)}
		<a
			href={stat.href}
			class="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.99]"
		>
			<div
				class="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
			>
				<stat.icon class="size-4" />
			</div>
			<div class="min-w-0">
				<p class="text-2xl leading-none font-semibold tracking-tight text-foreground">
					{stat.value}
				</p>
				<p class="mt-1 truncate text-xs text-muted-foreground">{stat.label}</p>
			</div>
		</a>
	{/each}
</div>

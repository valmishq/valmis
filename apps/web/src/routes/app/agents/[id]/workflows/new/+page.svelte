<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import WorkflowBuilder from '$lib/components/custom/workflow/canvas/WorkflowBuilder.svelte';
	import type { PageData } from './$types';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	let { data }: { data: PageData } = $props();

	const isEditMode = $derived(data.isEditMode);
	const agent = $derived(data.agent);
	const workflow = $derived(data.workflow);

	// Bound from the builder: serialized workflow JSON + live validation problems.
	let payload = $state('');
	let validationErrors = $state<string[]>([]);
	let isSaving = $state(false);

	// Show saved alert after redirect
	$effect(() => {
		if ($page.url.searchParams.get('saved') === 'true') {
			setAlert({
				type: 'success',
				title: isEditMode ? 'Workflow updated' : 'Workflow created',
				message: isEditMode
					? 'Your workflow has been saved.'
					: 'Your new workflow has been created.',
				duration: 5000,
				show: true
			});
		}
	});
</script>

<svelte:head>
	{#if isEditMode && workflow}
		<title>{workflow.name} — Edit Workflow — AgentInt</title>
		<meta name="description" content="Edit the workflow configuration for {agent.name}." />
	{:else}
		<title>New Workflow — {agent.name} — AgentInt</title>
		<meta name="description" content="Create a new automated workflow for {agent.name}." />
	{/if}
</svelte:head>

<PageHeader
	title={isEditMode && workflow ? workflow.name : 'New Workflow'}
	description="Design a multi-step automation by connecting nodes on the canvas."
>
	{#snippet actions()}
		<Button
			variant="outline"
			size="sm"
			onclick={() => goto(`/app/workflows?agentId=${agent.id}`)}
			class="gap-2"
		>
			<ArrowLeftIcon class="size-4" />
			Back to workflows
		</Button>
	{/snippet}
</PageHeader>

<!-- Server-side form action handles create and edit -->
<form
	method="POST"
	action="?/save"
	use:enhance={({ cancel }) => {
		if (validationErrors.length > 0) {
			cancel();
			setAlert({
				type: 'error',
				title: `Fix ${validationErrors.length} issue${validationErrors.length > 1 ? 's' : ''} before saving`,
				message: validationErrors.join('\n'),
				duration: 7000,
				show: true
			});
			return;
		}
		isSaving = true;
		return async ({ result, update }) => {
			isSaving = false;
			if (result.type === 'failure') {
				const failData = result.data as { error?: string; messages?: string[] };
				const messages = failData?.messages ?? (failData?.error ? failData.error.split('\n') : []);
				console.error('[workflow] save failed:', messages.length ? messages : failData?.error);
				setAlert({
					type: 'error',
					title: isEditMode ? 'Failed to save workflow' : 'Failed to create workflow',
					message: messages.join('\n') || failData?.error || 'An unexpected error occurred.',
					duration: 7000,
					show: true
				});
			} else {
				await update();
			}
		};
	}}
	class="space-y-4"
>
	<!-- Hidden fields populated by the builder -->
	{#if isEditMode && workflow}
		<input type="hidden" name="workflowId" value={workflow.id} />
	{/if}
	<input type="hidden" name="workflowJson" value={payload} />

	<WorkflowBuilder
		{agent}
		{workflow}
		credentials={data.credentials}
		allCredentials={data.allCredentials}
		definitions={data.definitions}
		appTriggerProviders={data.appTriggerProviders}
		bind:payload
		bind:validationErrors
	/>

	{#if validationErrors.length > 0}
		<div class="space-y-1 rounded-md bg-destructive/10 p-4 text-sm text-destructive" role="alert">
			<p class="font-medium">
				Please fix {validationErrors.length} issue{validationErrors.length > 1 ? 's' : ''}:
			</p>
			<ul class="list-inside list-disc space-y-0.5">
				{#each validationErrors as message (message)}
					<li>{message}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="flex justify-end gap-3">
		<Button
			type="button"
			variant="outline"
			onclick={() => goto(`/app/workflows?agentId=${agent.id}`)}
			disabled={isSaving}
		>
			Cancel
		</Button>
		<Button type="submit" disabled={isSaving}>
			{#if isSaving}
				{isEditMode ? 'Saving…' : 'Creating…'}
			{:else}
				{isEditMode ? 'Save changes' : 'Create workflow'}
			{/if}
		</Button>
	</div>
</form>

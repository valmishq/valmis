<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import WorkflowRunDetail from '$lib/components/custom/workflow/WorkflowRunDetail.svelte';
	import type { PageData } from './$types';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Run {data.run.id.slice(0, 8)} — {data.workflow.name} — Valmis</title>
	<meta name="description" content="Step-by-step execution details for this workflow run." />
</svelte:head>

<PageHeader
	title="Run details - {data.workflow.name}"
	description="Step execution log for {data.workflow.name}."
>
	{#snippet actions()}
		<Button
			variant="outline"
			size="sm"
			onclick={() => goto(`/app/agents/${data.agent.id}/workflows/${data.workflow.id}/runs`)}
			class="gap-2"
		>
			<ArrowLeftIcon class="size-4" />
			Back to runs
		</Button>
	{/snippet}
</PageHeader>

<WorkflowRunDetail
	initialRun={data.run}
	initialStepLogs={data.stepLogs}
	agentId={data.agent.id}
	workflowId={data.workflow.id}
/>

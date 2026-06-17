<script lang="ts">
	import PageHeader from '$lib/components/page-header.svelte';
	import HomeStats from '$lib/components/custom/home/home-stats.svelte';
	import HomeAgentsGrid from '$lib/components/custom/home/home-agents-grid.svelte';
	import HomeTopWorkflows from '$lib/components/custom/home/home-top-workflows.svelte';
	import HomeRecentActivity from '$lib/components/custom/home/home-recent-activity.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Home — AgentInt</title>
	<meta
		name="description"
		content="Your AgentInt workspace — agents, workflows, and recent activity at a glance."
	/>
</svelte:head>

<PageHeader
	title="Home"
	description="An overview of your agents, workflows, and recent activity."
/>

<HomeStats
	agentCount={data.agents.length}
	workflowCount={data.workflows.length}
	credentialCount={data.credentials.length}
	knowledgeCount={data.knowledgeFiles.length}
/>

<HomeAgentsGrid agents={data.agents} />

<HomeTopWorkflows workflows={data.workflows} agents={data.agents} />

<HomeRecentActivity activity={data.activity} />

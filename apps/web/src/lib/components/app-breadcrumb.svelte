<script lang="ts">
	import { page } from '$app/state';
	import { activeBreadcrumbThreadTitle } from '$lib/stores/breadcrumb.store.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import type { Agent, Workflow } from '@repo/types';

	/**
	 * A breadcrumb item — either a link (with href) or the current page (no href).
	 */
	interface BreadcrumbSegment {
		label: string;
		href?: string;
	}

	/**
	 * Derives breadcrumb segments from the current pathname + search params.
	 * Dynamic names (agent, thread) are pulled from page.data which SvelteKit
	 * populates with the merged load data of all active layouts + the current page.
	 *
	 * Thread title is sourced from `activeBreadcrumbThreadTitle` store first so
	 * optimistic renames (and the initial load) are reflected immediately.
	 */
	let segments = $derived.by((): BreadcrumbSegment[] => {
		const pathname = page.url.pathname;
		const searchParams = page.url.searchParams;

		// Access dynamic entity names from merged page data
		const agent = (page.data as Record<string, unknown>).agent as Agent | null | undefined;
		const workflow = (page.data as Record<string, unknown>).workflow as Workflow | null | undefined;

		// ── /app ──────────────────────────────────────────────────────────────────
		if (pathname === '/app') {
			return [{ label: 'Home' }];
		}

		// ── /app/chat ─────────────────────────────────────────────────────────────
		if (pathname === '/app/chat') {
			return [{ label: 'Chat' }];
		}

		// ── /app/chat/[agentId] ───────────────────────────────────────────────────
		const chatAgentMatch = pathname.match(/^\/app\/chat\/([^/]+)$/);
		if (chatAgentMatch) {
			const agentName = agent?.name ?? 'Agent';
			return [{ label: 'Chat', href: '/app/chat' }, { label: agentName }];
		}

		// ── /app/chat/[agentId]/[threadId] ────────────────────────────────────────
		const chatThreadMatch = pathname.match(/^\/app\/chat\/([^/]+)\/([^/]+)$/);
		if (chatThreadMatch) {
			const agentId = chatThreadMatch[1];
			const agentName = agent?.name ?? 'Agent';
			// Prefer the live store value; fall back to page.data.thread.title
			const storeTitle = $activeBreadcrumbThreadTitle;
			const pageThread = (page.data as Record<string, unknown>).thread as
				| { title?: string }
				| null
				| undefined;
			const threadTitle = storeTitle ?? pageThread?.title ?? 'Session';
			return [
				{ label: 'Chat', href: '/app/chat' },
				{ label: agentName, href: `/app/chat/${agentId}` },
				{ label: threadTitle }
			];
		}

		// ── /app/agents ───────────────────────────────────────────────────────────
		if (pathname === '/app/agents') {
			return [{ label: 'Agents' }];
		}

		// ── /app/agents/[id]/memory ───────────────────────────────────────────────
		const agentMemoryMatch = pathname.match(/^\/app\/agents\/([^/]+)\/memory$/);
		if (agentMemoryMatch) {
			const agentName = agent?.name ?? 'Agent';
			return [
				{ label: 'Agents', href: '/app/agents' },
				{ label: agentName, href: `/app/agents/new?id=${agentMemoryMatch[1]}&editmode=true` },
				{ label: 'Memory' }
			];
		}

		// ── /app/agents/[id]/runs ────────────────────────────────────────────────
		const agentRunsMatch = pathname.match(/^\/app\/agents\/([^/]+)\/runs$/);
		if (agentRunsMatch) {
			const agentName = agent?.name ?? 'Agent';
			return [
				{ label: 'Agents', href: '/app/agents' },
				{ label: agentName, href: `/app/agents/new?id=${agentRunsMatch[1]}&editmode=true` },
				{ label: 'Runs' }
			];
		}

		// ── /app/agents/[id]/workflows/[workflowId]/runs/[runId] ──────────────────
		const workflowRunDetailMatch = pathname.match(
			/^\/app\/agents\/([^/]+)\/workflows\/([^/]+)\/runs\/([^/]+)$/
		);
		if (workflowRunDetailMatch) {
			const agentId = workflowRunDetailMatch[1];
			const workflowId = workflowRunDetailMatch[2];
			const agentName = agent?.name ?? 'Agent';
			const workflowName = workflow?.name ?? 'Workflow';
			return [
				{ label: 'Agents', href: '/app/agents' },
				{ label: agentName, href: `/app/agents/new?id=${agentId}&editmode=true` },
				{ label: 'Workflows', href: `/app/agents/${agentId}/workflows` },
				{
					label: workflowName,
					href: `/app/agents/${agentId}/workflows/new?workflowId=${workflowId}&editmode=true`
				},
				{ label: 'Runs', href: `/app/agents/${agentId}/workflows/${workflowId}/runs` },
				{ label: 'Run' }
			];
		}

		// ── /app/agents/[id]/workflows/[workflowId]/runs ──────────────────────────
		const workflowRunsMatch = pathname.match(/^\/app\/agents\/([^/]+)\/workflows\/([^/]+)\/runs$/);
		if (workflowRunsMatch) {
			const agentId = workflowRunsMatch[1];
			const workflowId = workflowRunsMatch[2];
			const agentName = agent?.name ?? 'Agent';
			const workflowName = workflow?.name ?? 'Workflow';
			return [
				{ label: 'Agents', href: '/app/agents' },
				{ label: agentName, href: `/app/agents/new?id=${agentId}&editmode=true` },
				{ label: 'Workflows', href: `/app/agents/${agentId}/workflows` },
				{
					label: workflowName,
					href: `/app/agents/${agentId}/workflows/new?workflowId=${workflowId}&editmode=true`
				},
				{ label: 'Runs' }
			];
		}

		// ── /app/agents/[id]/workflows/new (create or edit mode) ──────────────────
		const workflowBuilderMatch = pathname.match(/^\/app\/agents\/([^/]+)\/workflows\/new$/);
		if (workflowBuilderMatch) {
			const agentId = workflowBuilderMatch[1];
			const agentName = agent?.name ?? 'Agent';
			const isEditMode = searchParams.get('editmode') === 'true';
			if (isEditMode && workflow) {
				return [
					{ label: 'Agents', href: '/app/agents' },
					{ label: agentName, href: `/app/agents/new?id=${agentId}&editmode=true` },
					{ label: 'Workflows', href: `/app/agents/${agentId}/workflows` },
					{ label: workflow.name }
				];
			}
			return [
				{ label: 'Agents', href: '/app/agents' },
				{ label: agentName, href: `/app/agents/new?id=${agentId}&editmode=true` },
				{ label: 'Workflows', href: `/app/agents/${agentId}/workflows` },
				{ label: 'New Workflow' }
			];
		}

		// ── /app/agents/[id]/workflows (list) ─────────────────────────────────────
		const workflowListMatch = pathname.match(/^\/app\/agents\/([^/]+)\/workflows$/);
		if (workflowListMatch) {
			const agentId = workflowListMatch[1];
			const agentName = agent?.name ?? 'Agent';
			return [
				{ label: 'Agents', href: '/app/agents' },
				{ label: agentName, href: `/app/agents/new?id=${agentId}&editmode=true` },
				{ label: 'Workflows' }
			];
		}

		// ── /app/agents/new (create or edit mode) ─────────────────────────────────
		if (pathname === '/app/agents/new') {
			const isEditMode = searchParams.get('editmode') === 'true';
			if (isEditMode && agent) {
				return [{ label: 'Agents', href: '/app/agents' }, { label: agent.name }];
			}
			return [{ label: 'Agents', href: '/app/agents' }, { label: 'New Agent' }];
		}

		// ── /app/credentials ──────────────────────────────────────────────────────
		if (pathname === '/app/credentials') {
			return [{ label: 'Credentials' }];
		}

		// ── /app/llm-providers ────────────────────────────────────────────────────
		if (pathname === '/app/llm-providers') {
			return [{ label: 'LLM Providers' }];
		}

		// ── /app/account/* ────────────────────────────────────────────────────────
		if (pathname === '/app/account/profile') {
			return [{ label: 'Account', href: '/app/account/profile' }, { label: 'Profile' }];
		}

		if (pathname === '/app/account/api-keys') {
			return [{ label: 'Account', href: '/app/account/profile' }, { label: 'API Keys' }];
		}

		// ── fallback: capitalise path segments ────────────────────────────────────
		const parts = pathname.replace(/^\/app\//, '').split('/');
		const fallback: BreadcrumbSegment[] = parts.map((part: string, i: number) => {
			const label = part
				.split('-')
				.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(' ');
			const isLast = i === parts.length - 1;
			if (isLast) return { label };
			const href = '/app/' + parts.slice(0, i + 1).join('/');
			return { label, href };
		});
		return fallback;
	});
</script>

<Breadcrumb.Root>
	<Breadcrumb.List>
		{#each segments as segment, i (segment.label + i)}
			<Breadcrumb.Item class="">
				{#if segment.href}
					<Breadcrumb.Link href={segment.href} class="truncate text-xs md:text-sm">
						{segment.label}
					</Breadcrumb.Link>
				{:else}
					<Breadcrumb.Page class="truncate text-xs font-medium md:text-sm">
						{segment.label}
					</Breadcrumb.Page>
				{/if}
			</Breadcrumb.Item>
			{#if i < segments.length - 1}
				<Breadcrumb.Separator />
			{/if}
		{/each}
	</Breadcrumb.List>
</Breadcrumb.Root>

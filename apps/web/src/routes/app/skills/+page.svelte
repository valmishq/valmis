<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/page-header.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import SkillInstallDialog from '$lib/components/custom/skill-install-dialog.svelte';
	import { api } from '$lib/api.client.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import GitBranchIcon from '@lucide/svelte/icons/git-branch';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import PackageIcon from '@lucide/svelte/icons/package';
	import type { InstalledSkill } from '@repo/types';

	let { data } = $props();

	// ── Install dialog ────────────────────────────────────────────────────────
	let installDialogOpen = $state(false);

	// ── Delete dialog ─────────────────────────────────────────────────────────
	let skillToDelete = $state<InstalledSkill | null>(null);
	let deleteDialogOpen = $state(false);
	let deleting = $state(false);

	function openDeleteDialog(skill: InstalledSkill) {
		skillToDelete = skill;
		deleteDialogOpen = true;
	}

	async function confirmDelete() {
		if (!skillToDelete) return;
		deleting = true;
		try {
			const res = await api(`/skills/installed/${skillToDelete.id}`, { method: 'DELETE' });
			const body = await res.json();
			if (!res.ok || !body.success) {
				setAlert({
					type: 'error',
					title: 'Failed to uninstall skill',
					message: body.error ?? 'Please try again.',
					duration: 5000,
					show: true
				});
				return;
			}
			const unassigned = (body.data as { unassignedAgentCount: number }).unassignedAgentCount;
			setAlert({
				type: 'success',
				title: 'Skill uninstalled',
				message:
					unassigned > 0
						? `"${skillToDelete.name}" was removed and unassigned from ${unassigned} agent${unassigned === 1 ? '' : 's'}.`
						: `"${skillToDelete.name}" was removed.`,
				duration: 5000,
				show: true
			});
			deleteDialogOpen = false;
			skillToDelete = null;
			await invalidateAll();
		} catch {
			setAlert({
				type: 'error',
				title: 'Failed to uninstall skill',
				message: 'Please try again.',
				duration: 5000,
				show: true
			});
		} finally {
			deleting = false;
		}
	}

	function formatDate(iso: string | Date): string {
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Skills — Valmis Dashboard</title>
</svelte:head>

<div class="flex flex-col gap-6 p-6">
	<PageHeader
		title="Skills"
		description="Reusable instruction packages your agents can use. Install additional skills from GitHub repositories that follow the Agent Skills standard."
	>
		{#snippet actions()}
			<Button class="gap-1.5" onclick={() => (installDialogOpen = true)}>
				<DownloadIcon class="size-4" />
				Install from GitHub
			</Button>
		{/snippet}
	</PageHeader>

	<!-- ── Installed skills ──────────────────────────────────────────────────── -->
	<section class="space-y-3">
		<h2 class="text-sm font-medium text-foreground">
			Installed skills ({data.installed.length})
		</h2>

		{#if data.installed.length === 0}
			<Card.Root>
				<Card.Content>
					<div class="flex flex-col items-center gap-2 py-8">
						<PackageIcon class="size-6 text-muted-foreground" />
						<p class="text-sm text-muted-foreground">No skills installed yet.</p>
						<p class="max-w-md text-center text-xs text-muted-foreground">
							Install skills from any public GitHub repository following the <a
								href="https://github.com/agentskills/agentskills"
								target="_blank">Agent Skills</a
							> standard (a folder containing a SKILL.md). You review every skill before it is installed.
						</p>
					</div>
				</Card.Content>
			</Card.Root>
		{:else}
			<div class="space-y-2">
				{#each data.installed as skill (skill.id)}
					<Card.Root>
						<Card.Content class="flex items-start justify-between gap-4">
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<p class="text-sm font-medium text-foreground">{skill.name}</p>
									<span
										class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
										title="Installed from {skill.sourceUrl} at commit {skill.commitSha}"
									>
										<GitBranchIcon class="size-3" />
										{skill.sourceRepo}@{skill.commitSha.slice(0, 7)}
									</span>
									{#if skill.evolvable}
										<span
											class="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300"
										>
											<SparklesIcon class="size-3" />
											Evolvable
										</span>
									{/if}
								</div>
								<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{skill.description}</p>
								<p class="mt-1 text-xs text-muted-foreground">
									Installed {formatDate(skill.createdAt)}
								</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								class="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
								onclick={() => openDeleteDialog(skill)}
								title="Uninstall skill"
							>
								<Trash2Icon class="size-4" />
							</Button>
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{/if}
	</section>

	<!-- ── Built-in skills (read-only) ────────────────────────────────────────── -->
	<section class="space-y-3">
		<h2 class="text-sm font-medium text-foreground">Built-in skills ({data.builtins.length})</h2>
		<p class="text-xs text-muted-foreground">
			Shipped with the platform — always available when assigning skills to an agent.
		</p>
		<div class="space-y-2">
			{#each data.builtins as skill (skill.name)}
				<Card.Root>
					<Card.Content class="flex items-start gap-4">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<p class="text-sm font-medium text-foreground">{skill.name}</p>
								{#if skill.evolvable}
									<span
										class="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300"
									>
										<SparklesIcon class="size-3" />
										Evolvable
									</span>
								{/if}
							</div>
							<p class="mt-1 text-xs text-muted-foreground">{skill.description}</p>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	</section>
</div>

<!-- ── Install dialog ────────────────────────────────────────────────────────── -->
<SkillInstallDialog bind:open={installDialogOpen} onInstalled={() => invalidateAll()} />

<!-- ── Delete confirmation dialog ────────────────────────────────────────────── -->
<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Uninstall skill</Dialog.Title>
			<Dialog.Description>
				This removes "{skillToDelete?.name}" and unassigns it from every agent that uses it. Agents
				will no longer see this skill on their next run. This cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button
				type="button"
				variant="outline"
				onclick={() => (deleteDialogOpen = false)}
				disabled={deleting}
			>
				Cancel
			</Button>
			<Button type="button" variant="destructive" onclick={confirmDelete} disabled={deleting}>
				{deleting ? 'Uninstalling…' : 'Uninstall'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

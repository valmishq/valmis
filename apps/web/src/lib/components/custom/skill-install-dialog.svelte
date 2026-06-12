<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { api } from '$lib/api.client.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import GitBranchIcon from '@lucide/svelte/icons/git-branch';
	import type { SkillInstallPreview } from '@repo/types';

	interface Props {
		open: boolean;
		/** Called after a successful install so the parent can refresh its list */
		onInstalled: () => void;
	}

	let { open = $bindable(), onInstalled }: Props = $props();

	// ── Step state ────────────────────────────────────────────────────────────
	// 'form'   — enter the GitHub URL (+ optional subdirectory/ref)
	// 'review' — human review of the fetched bundle before confirming
	let step = $state<'form' | 'review'>('form');

	let repoUrl = $state('');
	let subpath = $state('');
	let ref = $state('');

	let previewLoading = $state(false);
	let confirmLoading = $state(false);
	let errorMessage = $state<string | null>(null);
	let preview = $state<SkillInstallPreview | null>(null);

	function resetDialog() {
		step = 'form';
		repoUrl = '';
		subpath = '';
		ref = '';
		errorMessage = null;
		preview = null;
		previewLoading = false;
		confirmLoading = false;
	}

	// Reset when the dialog closes so a stale preview never reappears
	$effect(() => {
		if (!open) resetDialog();
	});

	async function fetchPreview() {
		if (!repoUrl.trim()) {
			errorMessage = 'Repository URL is required.';
			return;
		}
		previewLoading = true;
		errorMessage = null;
		try {
			const res = await api('/skills/install/preview', {
				method: 'POST',
				body: JSON.stringify({
					repoUrl: repoUrl.trim(),
					subpath: subpath.trim() || undefined,
					ref: ref.trim() || undefined
				})
			});
			const body = await res.json();
			if (!res.ok || !body.success) {
				errorMessage = body.error ?? 'Failed to fetch the skill from GitHub.';
				return;
			}
			preview = body.data as SkillInstallPreview;
			step = 'review';
		} catch {
			errorMessage = 'Failed to fetch the skill. Check your connection and try again.';
		} finally {
			previewLoading = false;
		}
	}

	async function confirmInstall() {
		if (!preview) return;
		confirmLoading = true;
		errorMessage = null;
		try {
			const res = await api('/skills/install/confirm', {
				method: 'POST',
				body: JSON.stringify({ previewId: preview.previewId })
			});
			const body = await res.json();
			if (!res.ok || !body.success) {
				errorMessage = body.error ?? 'Failed to install the skill.';
				return;
			}
			setAlert({
				type: 'success',
				title: 'Skill installed',
				message: `"${preview.name}" was installed from ${preview.sourceRepo}.`,
				duration: 5000,
				show: true
			});
			open = false;
			onInstalled();
		} catch {
			errorMessage = 'Failed to install the skill. Please try again.';
		} finally {
			confirmLoading = false;
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
		{#if step === 'form'}
			<Dialog.Header>
				<Dialog.Title>Install skill from GitHub</Dialog.Title>
				<Dialog.Description>
					Skills follow the <a href="https://github.com/agentskills/agentskills" target="_blank"
						>Agent Skills</a
					> open standard (a folder with a SKILL.md). Paste a public GitHub repository URL — you will
					review the full content of SKILL.md before anything is installed.
				</Dialog.Description>
			</Dialog.Header>

			<div class="space-y-4">
				<div class="space-y-1.5">
					<Label for="skill-repo-url">Repository URL</Label>
					<Input
						id="skill-repo-url"
						bind:value={repoUrl}
						placeholder="https://github.com/owner/repo or owner/repo"
					/>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1.5">
						<Label for="skill-subpath">Subdirectory (optional)</Label>
						<Input id="skill-subpath" bind:value={subpath} placeholder="skills/my-skill" />
					</div>
					<div class="space-y-1.5">
						<Label for="skill-ref">Branch or tag (optional)</Label>
						<Input id="skill-ref" bind:value={ref} placeholder="main" />
					</div>
				</div>

				{#if errorMessage}
					<div class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
						{errorMessage}
					</div>
				{/if}
			</div>

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="button" onclick={fetchPreview} disabled={previewLoading}>
					{previewLoading ? 'Fetching…' : 'Fetch & review'}
				</Button>
			</Dialog.Footer>
		{:else if preview}
			<Dialog.Header>
				<Dialog.Title class="flex flex-wrap items-center gap-2">
					{preview.name}
					{#if preview.evolvable}
						<span
							class="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300"
						>
							<SparklesIcon class="size-3" />
							Evolvable
						</span>
					{/if}
				</Dialog.Title>
				<Dialog.Description class="flex items-center gap-1.5">
					<GitBranchIcon class="size-3.5" />
					{preview.sourceRepo}@{preview.commitSha.slice(0, 7)}
					{#if preview.sourceSubpath}
						· {preview.sourceSubpath}
					{/if}
				</Dialog.Description>
			</Dialog.Header>

			<div class="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
				<!-- Third-party warning banner -->
				<div
					class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
					role="alert"
				>
					<TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
					<p>
						This skill comes from a third-party repository. Review the full instructions below —
						malicious skills can manipulate the agent into misusing its credentials. Only install
						skills from sources you trust.
					</p>
				</div>

				<p class="text-sm text-muted-foreground">{preview.description}</p>

				<!-- Scan findings -->
				{#if preview.findings.length > 0}
					<div class="space-y-2">
						<h4 class="text-sm font-medium text-foreground">
							Security scan — {preview.findings.length} finding{preview.findings.length === 1
								? ''
								: 's'} to review
						</h4>
						<div class="space-y-1.5">
							{#each preview.findings as finding (finding.rule + finding.file + (finding.line ?? 0))}
								<div
									class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs dark:border-amber-800 dark:bg-amber-950"
								>
									<div class="flex flex-wrap items-center gap-2">
										<span class="font-medium text-amber-900 dark:text-amber-200"
											>{finding.rule}</span
										>
										<span class="text-amber-700 dark:text-amber-400">
											{finding.file}{finding.line ? `:${finding.line}` : ''}
										</span>
									</div>
									<code class="mt-1 block break-all text-amber-800 dark:text-amber-300"
										>{finding.excerpt}</code
									>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<p class="text-xs text-muted-foreground">
						The automated scan found nothing suspicious — still, always review the instructions
						yourself.
					</p>
				{/if}

				<!-- File tree (files that will be installed) -->
				<div class="space-y-2">
					<h4 class="text-sm font-medium text-foreground">
						Files to install ({preview.files.length}, {formatBytes(preview.totalSize)})
					</h4>
					<div class="rounded-md border border-border">
						{#each preview.files as file (file.path)}
							<div
								class="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-xs last:border-b-0"
							>
								<span class="flex min-w-0 items-center gap-1.5 text-foreground">
									<FileTextIcon class="size-3 shrink-0 text-muted-foreground" />
									<span class="truncate">{file.path}</span>
								</span>
								<span class="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- Files filtered out by the file-type policy -->
				{#if preview.filteredFiles.length > 0}
					<div class="space-y-2">
						<h4 class="text-sm font-medium text-foreground">
							Filtered out ({preview.filteredFiles.length})
						</h4>
						<div
							class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
							role="alert"
						>
							<p class="flex items-start gap-1.5">
								<TriangleAlertIcon class="mt-0.5 size-3.5 shrink-0" />
								The following files were filtered out for security reasons and will NOT be installed.
								Only these file types are allowed: {preview.allowedExtensions
									.map((e) => `.${e}`)
									.join(', ')}.
							</p>
							<ul class="mt-1.5 space-y-0.5 pl-5">
								{#each preview.filteredFiles as path (path)}
									<li class="font-mono break-all">{path}</li>
								{/each}
							</ul>
						</div>
					</div>
				{/if}

				<!-- Full SKILL.md content -->
				<div class="space-y-2">
					<h4 class="text-sm font-medium text-foreground">SKILL.md — full content</h4>
					<pre
						class="max-h-72 overflow-y-auto rounded-md border border-border bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap">{preview.skillMdContent}</pre>
				</div>

				{#if errorMessage}
					<div class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
						{errorMessage}
					</div>
				{/if}
			</div>

			<Dialog.Footer>
				<Button
					type="button"
					variant="outline"
					onclick={() => {
						step = 'form';
						errorMessage = null;
					}}
					disabled={confirmLoading}
				>
					Back
				</Button>
				<Button type="button" onclick={confirmInstall} disabled={confirmLoading}>
					{confirmLoading ? 'Installing…' : 'I reviewed it — install'}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>

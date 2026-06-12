<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { api } from '$lib/api.client.js';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte.js';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import type { KnowledgeFile } from '@repo/types';

	interface Props {
		/** Called with the created library rows (status 'pending') after a successful upload */
		onUploaded: (files: KnowledgeFile[]) => void;
		disabled?: boolean;
		variant?: 'default' | 'outline';
		size?: 'default' | 'sm';
	}

	let { onUploaded, disabled = false, variant = 'default', size = 'default' }: Props = $props();

	/** Mirrors the backend allowlist (ALLOWED_KNOWLEDGE_EXTENSIONS) */
	const ACCEPT = '.pdf,.docx,.xlsx,.pptx,.txt,.md,.markdown,.csv,.json,.html,.htm';

	let fileInput = $state<HTMLInputElement | null>(null);
	let uploading = $state(false);

	async function handleFilesSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;

		const formData = new FormData();
		for (const file of files) {
			formData.append('files', file);
		}
		// Allow re-selecting the same file later
		input.value = '';

		uploading = true;
		try {
			const res = await api('/knowledge/files/upload', { method: 'POST', body: formData });
			const body = await res.json();
			if (!res.ok || !body.success) {
				setAlert({
					type: 'error',
					title: 'Upload failed',
					message: body.error ?? 'Could not upload the selected files.',
					duration: 5000,
					show: true
				});
				return;
			}
			const created = (body.data ?? []) as KnowledgeFile[];
			setAlert({
				type: 'success',
				title: 'Upload started',
				message: `${created.length} file${created.length === 1 ? '' : 's'} queued for text extraction.`,
				duration: 4000,
				show: true
			});
			onUploaded(created);
		} catch {
			setAlert({
				type: 'error',
				title: 'Upload failed',
				message: 'Could not reach the server. Please try again.',
				duration: 5000,
				show: true
			});
		} finally {
			uploading = false;
		}
	}
</script>

<input
	bind:this={fileInput}
	type="file"
	multiple
	accept={ACCEPT}
	class="hidden"
	onchange={handleFilesSelected}
/>
<Button
	type="button"
	{variant}
	{size}
	class="gap-1.5"
	disabled={disabled || uploading}
	onclick={() => fileInput?.click()}
>
	<UploadIcon class="size-4" />
	{uploading ? 'Uploading…' : 'Upload files'}
</Button>

<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	/**
	 * Modal dialog for renaming a chat thread.
	 * Controlled externally via the `open` prop (two-way binding).
	 */
	let {
		open = $bindable(false),
		currentTitle = '',
		isSaving = false,
		onSave
	}: {
		open: boolean;
		currentTitle: string;
		isSaving?: boolean;
		onSave: (title: string) => void;
	} = $props();

	/** Local draft — reset whenever the dialog opens with a new currentTitle */
	let draft = $state(currentTitle);

	$effect(() => {
		if (open) {
			draft = currentTitle;
		}
	});

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		const trimmed = draft.trim();
		if (!trimmed) return;
		onSave(trimmed);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Rename conversation</Dialog.Title>
			<Dialog.Description>Give this conversation a new title.</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={handleSubmit} class="space-y-4 pt-2">
			<div class="space-y-1.5">
				<Label for="thread-title">Title</Label>
				<Input
					id="thread-title"
					bind:value={draft}
					placeholder="Conversation title…"
					maxlength={120}
					disabled={isSaving}
					autofocus
				/>
			</div>

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)} disabled={isSaving}>
					Cancel
				</Button>
				<Button type="submit" disabled={!draft.trim() || isSaving}>
					{isSaving ? 'Saving…' : 'Save'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

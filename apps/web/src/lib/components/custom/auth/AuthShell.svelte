<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const year = new Date().getFullYear();
</script>

<div class="flex min-h-screen flex-col bg-muted/40">
	<main class="flex flex-1 flex-col items-center justify-center p-4">
		<!-- Brand header -->
		<header class="mb-8 flex items-center gap-2.5">
			<img src="/valmis/icon.svg" alt="Valmis" class="size-9" />
			<span class="font-heading text-2xl font-semibold tracking-tight">Valmis</span>
		</header>

		{@render children()}
	</main>

	<!-- Copyright footer -->
	<footer class="px-4 pb-6 text-center text-xs text-muted-foreground">
		<p>
			© {year} Valmis ·
			<a
				href="https://github.com/valmishq/valmis"
				target="_blank"
				rel="noopener noreferrer"
				class="font-medium underline-offset-4 transition-colors hover:text-foreground hover:underline"
			>
				GitHub
			</a>
		</p>
	</footer>
</div>

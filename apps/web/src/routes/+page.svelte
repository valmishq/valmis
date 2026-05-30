<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Root page — redirect to dashboard; layout will redirect to signin/setup if needed
	onMount(() => {
		goto('/app');
	});
</script>

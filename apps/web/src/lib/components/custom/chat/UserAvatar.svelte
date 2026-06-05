<script lang="ts">
	/**
	 * User avatar circle with initials.
	 */
	let {
		displayName,
		size = 'md'
	}: {
		displayName: string;
		size?: 'sm' | 'md' | 'lg';
	} = $props();

	const sizeClasses: Record<string, string> = {
		sm: 'size-7 text-xs',
		md: 'size-8 text-xs',
		lg: 'size-10 text-sm'
	};

	let initial = $derived(displayName.charAt(0).toUpperCase());
</script>

<div
	class="flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground {sizeClasses[
		size
	]}"
	title={displayName}
>
	{initial}
</div>

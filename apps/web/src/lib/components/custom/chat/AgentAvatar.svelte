<script lang="ts">
	import BotIcon from '@lucide/svelte/icons/bot';

	/**
	 * Reusable agent avatar — renders an emoji, an image URL, or a bot icon fallback.
	 * Used in chat messages, thread lists, and agent pickers.
	 */
	let {
		avatarUrl,
		name,
		size = 'md'
	}: {
		avatarUrl?: string;
		name?: string;
		size?: 'sm' | 'md' | 'lg';
	} = $props();

	const sizeClasses: Record<string, string> = {
		sm: 'size-7 text-sm',
		md: 'size-8 text-base',
		lg: 'size-10 text-xl'
	};

	const iconSizeClasses: Record<string, string> = {
		sm: 'size-3.5',
		md: 'size-4',
		lg: 'size-5'
	};

	/** Detects if a string is a single emoji character. */
	function isEmoji(str: string | undefined): boolean {
		if (!str) return false;
		const segments = [...str];
		return segments.length === 1 && /\p{Emoji}/u.test(str);
	}
</script>

<div
	class="flex shrink-0 items-center justify-center rounded-full bg-muted {sizeClasses[size]}"
	title={name}
>
	{#if isEmoji(avatarUrl)}
		<span class="leading-none">{avatarUrl}</span>
	{:else if avatarUrl}
		<img
			src={avatarUrl}
			alt={name ?? 'Agent avatar'}
			class="rounded-full object-cover {sizeClasses[size]}"
		/>
	{:else}
		<BotIcon class="text-muted-foreground {iconSizeClasses[size]}" />
	{/if}
</div>

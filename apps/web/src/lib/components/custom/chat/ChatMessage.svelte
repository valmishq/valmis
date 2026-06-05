<script lang="ts">
	import AgentAvatar from './AgentAvatar.svelte';
	import UserAvatar from './UserAvatar.svelte';
	import ThinkingBlock from './ThinkingBlock.svelte';
	import ToolCallIndicator from './ToolCallIndicator.svelte';
	import MarkdownRenderer from './MarkdownRenderer.svelte';
	import ImageBlock from './ImageBlock.svelte';
	import type { AgentMessage, ContentBlock } from '@repo/types';

	/**
	 * Renders a single chat message row.
	 * Handles user, assistant, and tool_result roles.
	 * Supports streaming (partially built text content).
	 */
	let {
		message,
		agentName,
		agentAvatarUrl,
		userDisplayName,
		isStreaming = false,
		/** Map of toolCallId → result string, for matching tool_result back to toolCall */
		toolResults = {},
		/**
		 * Map of toolCallId → { toolName, argsJson }.
		 * Populated by tool_call_delta SSE events so ToolCallIndicator can show
		 * the arguments the LLM decided to pass (the "thinking context").
		 */
		toolCallArgs = {}
	}: {
		message: AgentMessage;
		agentName: string;
		agentAvatarUrl?: string;
		userDisplayName: string;
		isStreaming?: boolean;
		toolResults?: Record<string, string>;
		toolCallArgs?: Record<string, { toolName: string; argsJson: string }>;
	} = $props();

	let isUser = $derived(message.role === 'user');
	let isAssistant = $derived(message.role === 'assistant');

	/** Extract text blocks from content for rendering */
	let textBlocks = $derived(
		message.content.filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
	);

	let thinkingBlocks = $derived(
		message.content.filter(
			(b): b is Extract<ContentBlock, { type: 'thinking' }> => b.type === 'thinking'
		)
	);

	let toolCallBlocks = $derived(
		message.content.filter(
			(b): b is Extract<ContentBlock, { type: 'toolCall' }> => b.type === 'toolCall'
		)
	);

	let imageBlocks = $derived(
		message.content.filter((b): b is Extract<ContentBlock, { type: 'image' }> => b.type === 'image')
	);

	/** Combined text across all text blocks for display. */
	let combinedText = $derived(textBlocks.map((b) => b.text).join('\n\n'));

	/** Show a loading pulse if streaming and no text yet */
	let showTypingIndicator = $derived(isStreaming && isAssistant && combinedText.length === 0);
</script>

{#if message.role === 'tool_result'}
	<!-- Tool result messages are not shown directly; they are surfaced via ToolCallIndicator -->
{:else}
	<div class="group flex gap-3 px-4 py-3 {isUser ? 'flex-row-reverse' : 'flex-row'}">
		<!-- Avatar -->
		<div class="mt-0.5 shrink-0">
			{#if isUser}
				<UserAvatar displayName={userDisplayName} size="md" />
			{:else}
				<AgentAvatar avatarUrl={agentAvatarUrl} name={agentName} size="md" />
			{/if}
		</div>

		<!-- Message content: max-w-[75%] caps width; min-w-0 + overflow-hidden prevents flex blowout on mobile -->
		<div
			class="flex max-w-[75%] min-w-0 flex-col gap-1 overflow-hidden {isUser
				? 'items-end'
				: 'items-start'}"
		>
			<!-- Sender label -->
			<span class="text-xs font-medium text-muted-foreground">
				{isUser ? userDisplayName : agentName}
			</span>

			{#if isAssistant}
				<!-- Thinking blocks — shown before main text -->
				{#each thinkingBlocks as block, i (i)}
					<ThinkingBlock
						content={block.thinking}
						isStreaming={isStreaming && i === thinkingBlocks.length - 1}
					/>
				{/each}

				<!-- Tool call indicators.
				 argsJson: prefer live tool_call_delta data; fall back to the arguments
				 stored in the content block itself (populated from DB for historical messages).
				 result: only available from live tool_call_end events during the current session.
			-->
				{#each toolCallBlocks as block (block.id)}
					<ToolCallIndicator
						toolName={block.name}
						argsJson={toolCallArgs[block.id]?.argsJson ??
							(Object.keys(block.arguments).length > 0
								? JSON.stringify(block.arguments, null, 2)
								: undefined)}
						result={toolResults[block.id]}
						isRunning={isStreaming && !toolResults[block.id]}
					/>
				{/each}

				<!-- Main text content — rendered as markdown -->
				{#if combinedText}
					<div class="rounded-2xl rounded-tl-sm px-2 py-2.5">
						<MarkdownRenderer content={combinedText} {isStreaming} />
					</div>
				{/if}

				<!-- Image blocks -->
				{#each imageBlocks as block, i (i)}
					<ImageBlock data={block.data} mimeType={block.mimeType} />
				{/each}

				<!-- Typing indicator (streaming, no text yet) -->
				{#if showTypingIndicator}
					<div class="rounded-2xl rounded-tl-sm bg-muted px-2 py-3">
						<span class="flex items-center gap-1.5">
							<span
								class="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]"
							></span>
							<span
								class="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]"
							></span>
							<span
								class="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]"
							></span>
						</span>
					</div>
				{/if}
			{:else}
				<!-- User message bubble — wrap-break-word prevents long URLs from overflowing -->
				<div class="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm leading-relaxed">
					<p class="font-serif wrap-break-word whitespace-pre-wrap text-primary-foreground">
						{combinedText}
					</p>
				</div>
			{/if}

			<!-- Token usage (assistant only, shown after streaming completes) -->
			{#if isAssistant && !isStreaming && message.tokenUsage}
				<span class="text-[10px] text-muted-foreground/60">
					{message.tokenUsage.input + message.tokenUsage.output} tokens
				</span>
			{/if}
		</div>
	</div>
{/if}

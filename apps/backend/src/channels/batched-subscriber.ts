import type { AgentStreamEvent, ChannelStreamSubscriber } from '@repo/types';
import { logger } from '../config/logger.js';

/**
 * Platform send primitives a batched channel must provide. Everything else
 * (buffering, typing lifecycle, tool-notice de-dup, flush-on-completion) is
 * handled by createBatchedSubscriber.
 */
export interface BatchedDelivery {
	/** Channel name, for log context (e.g. 'telegram', 'discord'). */
	readonly channel: string;
	/** How often to refresh the typing indicator while the agent works (ms). */
	readonly typingRefreshMs: number;
	/** Show or refresh the platform's native typing indicator. */
	sendTyping(): Promise<void>;
	/** Send the agent's accumulated response text. The platform handles its own formatting and chunking. */
	sendText(text: string): Promise<void>;
	/** Send a short, unformatted status line (tool notices, errors). */
	sendNotice(text: string): Promise<void>;
	/** Send a HITL prompt, rendering options as native interactive buttons when present. */
	sendHitl(prompt: string, options: string[]): Promise<void>;
}

export interface BatchedSubscriberOptions {
	/** Emit "🔧 Using {tool}…" notices while the agent runs tools. */
	notifyToolUsage?: boolean;
}

/**
 * Build a ChannelStreamSubscriber for a "batched" channel (Telegram, Discord, …)
 * that accumulates streamed deltas and dispatches them as whole messages.
 *
 * Channel-agnostic behaviour lives here:
 *   - buffer text_delta and flush on message_end / hitl_request / error
 *   - keep the typing indicator alive on an interval while the agent works
 *   - de-duplicate per-tool-call notifications (tool_call_delta can repeat)
 *
 * A new channel only implements the four BatchedDelivery primitives.
 */
export function createBatchedSubscriber(
	delivery: BatchedDelivery,
	options: BatchedSubscriberOptions = {},
): ChannelStreamSubscriber {
	let textBuffer = '';
	let typingInterval: ReturnType<typeof setInterval> | null = null;
	/** Tool calls already announced — tool_call_delta can fire more than once per call. */
	const notifiedToolCalls = new Set<string>();

	const startTyping = () => {
		void delivery.sendTyping().catch(() => {});
		if (!typingInterval) {
			typingInterval = setInterval(() => {
				void delivery.sendTyping().catch(() => {});
			}, delivery.typingRefreshMs);
		}
	};

	const stopTyping = () => {
		if (typingInterval) {
			clearInterval(typingInterval);
			typingInterval = null;
		}
	};

	const flush = async () => {
		if (!textBuffer.trim()) return;
		const text = textBuffer;
		textBuffer = '';
		await delivery.sendText(text).catch((err: unknown) => {
			logger.error({ err, channel: delivery.channel }, '[channel] flush failed');
		});
	};

	return {
		async onEvent(event: AgentStreamEvent): Promise<void> {
			switch (event.type) {
				case 'message_start':
				case 'tool_call_start':
					// Show/refresh typing while producing output or running a tool.
					startTyping();
					break;

				case 'text_delta':
					textBuffer += event.delta;
					break;

				case 'tool_call_delta':
					// tool_call_delta (not tool_call_start) reliably carries the tool name.
					if (
						options.notifyToolUsage &&
						event.toolName &&
						!notifiedToolCalls.has(event.toolCallId)
					) {
						notifiedToolCalls.add(event.toolCallId);
						await delivery
							.sendNotice(`🔧 Using ${event.toolName}…`)
							.catch((err: unknown) =>
								logger.warn(
									{ err, channel: delivery.channel },
									'[channel] tool notification failed',
								),
							);
					}
					break;

				case 'hitl_request':
					stopTyping();
					await flush();
					await delivery
						.sendHitl(event.prompt ?? 'The agent is waiting for your input.', event.options ?? [])
						.catch((err: unknown) =>
							logger.warn({ err, channel: delivery.channel }, '[channel] HITL prompt failed'),
						);
					break;

				case 'message_end':
					stopTyping();
					await flush();
					break;

				case 'error':
					stopTyping();
					await flush();
					await delivery.sendNotice(`⚠️ ${event.message ?? 'An error occurred.'}`).catch(() => {});
					break;

				case 'done':
					stopTyping();
					break;
			}
		},

		onComplete(): void {
			stopTyping();
		},

		dispose(): void {
			stopTyping();
			textBuffer = '';
		},
	};
}

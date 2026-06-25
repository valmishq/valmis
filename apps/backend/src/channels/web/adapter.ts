import type {
	ChannelAdapter,
	ChannelStreamSubscriber,
	ChannelSubscriberOptions,
	InboundMessage,
	OutboundMessage,
	AdapterInboundContext,
} from '@repo/types';

/**
 * WebAdapter — the channel adapter for the built-in browser UI.
 *
 * Delivery model: 'streaming'
 * The browser opens an EventSource connection to GET /runtime/:agentId/threads/:threadId/stream
 * which subscribes to AgentStreamBus BEFORE the message is sent. Each SSE event is forwarded
 * character-by-character in real time. This means the web channel never needs a batched
 * subscriber — createStreamSubscriber() returns a no-op.
 *
 * handleInbound() is called by the refactored runtime.ts POST /messages handler.
 * It simply packages the already-resolved HTTP request data (userId, agentId, threadId
 * come from JWT auth + URL params) into an InboundMessage.
 */
export class WebAdapter implements ChannelAdapter {
	readonly channel = 'web';
	readonly deliveryMode = 'streaming' as const;

	/**
	 * Package HTTP request data into an InboundMessage.
	 * For web, identity resolution is already done by the time we get here:
	 *   - userId from JWT (req.user.sub)
	 *   - agentId and threadId from URL params
	 *   - content from request body
	 */
	async handleInbound(context: AdapterInboundContext): Promise<InboundMessage | null> {
		const body = context.rawBody as {
			content?: string;
			userDatetime?: string;
			fileIds?: string[];
		};

		const fileIds = Array.isArray(body.fileIds) ? body.fileIds : [];
		const hasText = typeof body.content === 'string' && body.content.length > 0;

		// A message must carry text and/or at least one attachment.
		if (!hasText && fileIds.length === 0) return null;

		const { agentId, threadId } = context.params;
		const userId = context.params.userId; // set by the route handler

		const content: InboundMessage['content'] = [];
		if (hasText) content.push({ type: 'text', text: body.content as string });
		for (const fileId of fileIds) content.push({ type: 'file', fileId });

		return {
			channel: 'web',
			externalId: userId,
			userId,
			agentId,
			threadId,
			content,
			userDatetime: body.userDatetime,
		};
	}

	/**
	 * No-op subscriber — the browser's EventSource already subscribes to
	 * AgentStreamBus via the GET /stream endpoint. Real-time SSE delivery
	 * happens there. This subscriber does nothing.
	 */
	createStreamSubscriber(
		_threadId: string,
		_externalId: string,
		_options?: ChannelSubscriberOptions,
	): ChannelStreamSubscriber {
		return {
			onEvent() {},
			onComplete() {},
			dispose() {},
		};
	}

	/**
	 * Web does not use push delivery. The browser pulls events via SSE.
	 */
	async send(_message: OutboundMessage): Promise<void> {
		// No-op for web channel — delivery happens via SSE subscription
	}
}

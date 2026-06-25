import type { ContentBlock, InboundContent } from '@repo/types';

/**
 * ContentProcessor — converts InboundContent[] from any channel into the
 * ContentBlock[] PERSISTED as the visible user message.
 *
 * Important: file attachments do NOT contribute content blocks here. The
 * persisted user message must contain only what the user actually said —
 * extracted document text, image blocks, and workspace-path notes are
 * system-generated and must never show in the user's own chat bubble. Those are
 * injected for the AGENT only, at history-load time, by the internal messages
 * route (see runtime.ts) via ChatFileService.buildPromptBlocks. The attachment
 * itself is rendered from the chat_files row linked to this message.
 *
 * Other media types (voice/image/document/video from external channels carrying a
 * downloaded local path) still fall back to a descriptive text block so the agent
 * is at least aware something was received.
 */
export class ContentProcessor {
	/**
	 * Normalize a list of InboundContent items into ContentBlock[].
	 * Filters out 'command' type — commands are handled by the adapter before
	 * the pipeline is called and must never reach the agent.
	 *
	 * @param content - The raw inbound content from the channel adapter
	 */
	async normalize(content: InboundContent[]): Promise<ContentBlock[]> {
		const blocks: ContentBlock[] = [];

		for (const item of content) {
			switch (item.type) {
				case 'text':
					// Direct passthrough — the most common case
					blocks.push({ type: 'text', text: item.text });
					break;

				case 'file':
					// A web upload (chat_files row). Intentionally contributes NO content
					// to the persisted message — it is rendered as an attachment and
					// injected for the agent at history-load time. See class comment.
					break;

				case 'voice':
					// Phase 3: replace with STT transcription
					// For now, inform the agent that audio was received
					blocks.push({
						type: 'text',
						text: `[Voice message received — ${item.durationMs ? `${Math.round(item.durationMs / 1000)}s` : 'unknown duration'}. Voice-to-text transcription not yet enabled.]`,
					});
					break;

				case 'image':
					// External-channel image carrying a downloaded local path — not yet wired.
					blocks.push({
						type: 'text',
						text: item.caption
							? `[Image received with caption: "${item.caption}". Image processing not yet enabled.]`
							: '[Image received. Image processing not yet enabled.]',
					});
					break;

				case 'document':
					// External-channel document carrying a downloaded local path — not yet wired.
					blocks.push({
						type: 'text',
						text: `[Document received: "${item.filename}" (${item.mimeType}). Document processing not yet enabled.]`,
					});
					break;

				case 'video':
					blocks.push({
						type: 'text',
						text: `[Video received${item.durationMs ? ` (${Math.round(item.durationMs / 1000)}s)` : ''}. Video processing not yet enabled.]`,
					});
					break;

				case 'location':
					blocks.push({
						type: 'text',
						text: `Location shared: latitude ${item.latitude}, longitude ${item.longitude}`,
					});
					break;

				case 'command':
					// Commands are handled by the adapter — skip silently
					break;
			}
		}

		return blocks;
	}
}

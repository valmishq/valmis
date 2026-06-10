import type { ContentBlock, InboundContent } from '@repo/types';

/**
 * ContentProcessor — converts InboundContent[] from any channel into
 * ContentBlock[] that the agent runtime understands.
 *
 * Phase 1: text passthrough only.
 * Phase 3: add voice→STT, document→workspace file save, image passthrough.
 *
 * All content types that are not yet handled fall back to a descriptive
 * text block so the agent is at least aware something was received.
 */
export class ContentProcessor {
	/**
	 * Normalize a list of InboundContent items into ContentBlock[].
	 * Filters out 'command' type — commands are handled by the adapter before
	 * the pipeline is called and must never reach the agent.
	 *
	 * @param content - The raw inbound content from the channel adapter
	 * @param _agentId - Reserved for Phase 3 (workspace path resolution)
	 */
	async normalize(content: InboundContent[], _agentId?: string): Promise<ContentBlock[]> {
		const blocks: ContentBlock[] = [];

		for (const item of content) {
			switch (item.type) {
				case 'text':
					// Direct passthrough — the most common case
					blocks.push({ type: 'text', text: item.text });
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
					// Phase 3: convert to base64 image block
					// For now, inform the agent
					blocks.push({
						type: 'text',
						text: item.caption
							? `[Image received with caption: "${item.caption}". Image processing not yet enabled.]`
							: '[Image received. Image processing not yet enabled.]',
					});
					break;

				case 'document':
					// Phase 3: save to agent workspace, pass file reference
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

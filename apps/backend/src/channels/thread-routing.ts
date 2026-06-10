import type { ChannelLink } from '@repo/types';
import type { ChannelService } from '../services/ChannelService.js';
import type { AgentSessionService } from '../services/AgentSessionService.js';

/** Result of resolving which thread an inbound channel message belongs to. */
export interface ResolvedThread {
	/** The thread the message should be appended to. */
	threadId: string;
	/**
	 * True only when a brand-new session was started because the previous one
	 * timed out in `per_session` mode. The adapter uses this to send a
	 * platform-formatted "session reset" notice. It is intentionally false for
	 * the very first thread of a link (no notice expected there).
	 */
	sessionExpired: boolean;
}

/**
 * Resolve the active thread for an inbound message on a channel link.
 *
 * Shared by every batched channel adapter:
 *   - No active thread yet  → create one and mark it active (no notice).
 *   - `per_session` mode    → if the active thread has been idle longer than
 *     `sessionTimeoutMin`, roll a fresh thread (sessionExpired = true).
 *   - Otherwise             → keep using the active thread.
 *
 * Pure persistence logic with no platform I/O — the caller sends any user-facing
 * notice in its own platform format.
 */
export async function resolveActiveThread(
	sessionService: AgentSessionService,
	channelService: ChannelService,
	link: ChannelLink,
): Promise<ResolvedThread> {
	if (!link.activeThreadId) {
		const thread = await sessionService.createThread({
			agentId: link.agentId,
			ownerId: link.userId,
		});
		await channelService.setActiveThread(link.id, thread.id);
		return { threadId: thread.id, sessionExpired: false };
	}

	if (link.threadMode === 'per_session') {
		const thread = await sessionService.getThreadByIdInternal(link.activeThreadId);
		if (thread) {
			const lastActivity = thread.updatedAt ?? thread.createdAt;
			const idleMs = Date.now() - new Date(lastActivity).getTime();
			const timeoutMs = link.sessionTimeoutMin * 60 * 1000;
			if (idleMs > timeoutMs) {
				const newThread = await sessionService.createThread({
					agentId: link.agentId,
					ownerId: link.userId,
				});
				await channelService.setActiveThread(link.id, newThread.id);
				return { threadId: newThread.id, sessionExpired: true };
			}
		}
	}

	return { threadId: link.activeThreadId, sessionExpired: false };
}

import { EventEmitter } from 'events';
import type { AgentStreamEvent } from '@repo/types';

/**
 * In-memory event bus for streaming agent events to connected SSE clients.
 *
 * Flow:
 *   1. Browser connects to GET /v1/runtime/:agentId/threads/:threadId/stream (SSE)
 *      → calls AgentStreamBus.subscribe(threadId, callback)
 *   2. LLM proxy handler receives streaming chunks from pi-ai
 *      → calls AgentStreamBus.emit(threadId, event) for each chunk
 *   3. AgentStreamBus forwards the event to all subscribed SSE connections
 *   4. On disconnect → AgentStreamBus.unsubscribe(threadId, callback)
 *
 * This is intentionally simple — a single EventEmitter per process.
 * In a multi-instance deployment (horizontal scaling), replace this with
 * a Redis pub/sub channel keyed by threadId.
 */
export class AgentStreamBus {
	private readonly emitter = new EventEmitter();

	constructor() {
		// Prevent Node.js from printing a MaxListenersExceededWarning.
		// Each thread can have multiple browser tabs subscribed simultaneously.
		this.emitter.setMaxListeners(0);
	}

	/** Emit an event to all subscribers for a thread */
	emit(threadId: string, event: AgentStreamEvent): void {
		this.emitter.emit(threadId, event);
	}

	/** Subscribe to events for a thread. Returns the unsubscribe function. */
	subscribe(threadId: string, callback: (event: AgentStreamEvent) => void): () => void {
		this.emitter.on(threadId, callback);
		return () => this.emitter.off(threadId, callback);
	}

	/** Check whether any subscribers are currently listening to a thread */
	hasSubscribers(threadId: string): boolean {
		return this.emitter.listenerCount(threadId) > 0;
	}
}

/** Singleton instance — shared across all route handlers in the process */
export const agentStreamBus = new AgentStreamBus();

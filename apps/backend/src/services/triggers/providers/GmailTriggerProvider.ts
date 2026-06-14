import type { AppTriggerEventInfo, AppTriggerState } from '@repo/types';
import {
	readErrorExcerpt,
	type AppTriggerProvider,
	type AppTriggerProviderContext,
	type AppTriggerResourceListResult,
	type AppWebhookHandleResult,
	type AppWebhookRegistration,
	type AppWebhookRequest,
	type NormalizedAppEvent,
} from '../AppTriggerProvider.js';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailWatchResponse {
	historyId?: string;
	expiration?: string; // ms epoch as string
}

interface GmailHistoryMessage {
	id: string;
	threadId?: string;
	labelIds?: string[];
}

interface GmailHistoryRecord {
	messagesAdded?: { message: GmailHistoryMessage }[];
}

interface GmailHistoryList {
	history?: GmailHistoryRecord[];
	historyId?: string;
	nextPageToken?: string;
}

interface GmailMessage {
	id: string;
	threadId?: string;
	labelIds?: string[];
	snippet?: string;
	internalDate?: string;
	payload?: GmailMessagePart;
}

interface GmailMessagePart {
	mimeType?: string;
	headers?: { name: string; value: string }[];
	body?: { data?: string; size?: number };
	parts?: GmailMessagePart[];
}

/**
 * Gmail app trigger — push delivery via Gmail API `users.watch` + Google Cloud Pub/Sub.
 *
 * Lifecycle:
 *   - registerWebhook → users.watch(topicName) → store baseline historyId + expiration.
 *   - Pub/Sub push subscription POSTs to /v1/webhooks/{triggerId}; handleWebhook decodes
 *     {emailAddress, historyId}, fetches users.history.list since the stored cursor,
 *     fetches + normalizes each new message, and advances the historyId cursor.
 *   - renewWebhook → re-issue users.watch (the watch expires ≤ 7 days).
 *   - unregisterWebhook → users.stop.
 *
 * Security: the inbound push only carries a historyId — actual message content is always
 * re-fetched from the authenticated Gmail API, so a spoofed push cannot inject content
 * (at worst it triggers an extra, empty history fetch). The triggerId in the URL is an
 * unguessable capability. Configure the Pub/Sub push subscription's auth for hardening.
 */
export class GmailTriggerProvider implements AppTriggerProvider {
	readonly id = 'gmail';
	readonly displayName = 'Gmail';
	readonly icon = '/logos/gmail.svg';
	readonly compatibleCredentialTypes = ['gmail', 'google-workspace'];
	readonly deliveryMode = 'webhook' as const;
	readonly setupNote =
		'Create a Google Cloud Pub/Sub topic, grant publish to ' +
		'gmail-api-push@system.gserviceaccount.com, and add a push subscription pointing to ' +
		'this trigger\'s delivery URL. Set the topic name below (or the server default).';

	listEvents(): AppTriggerEventInfo[] {
		return [
			{
				id: 'message.received',
				name: 'New email received',
				description: 'Fires when a new message arrives in the mailbox (optionally a label).',
				params: [
					{
						name: 'pubsubTopic',
						label: 'Pub/Sub topic',
						type: 'string',
						required: false,
						description:
							'Full topic name: projects/<project>/topics/<topic>. Falls back to the server default.',
						placeholder: 'projects/my-project/topics/gmail-push',
					},
					{
						name: 'labelId',
						label: 'Label filter',
						type: 'resource',
						resource: { type: 'gmail-label', searchable: true },
						required: false,
						description: 'Only watch this Gmail label (e.g. INBOX). Leave blank for all mail.',
						placeholder: 'All mail',
					},
				],
				payloadShape:
					'{ from, to, subject, snippet, body, receivedAt, messageId, threadId, labels, raw }',
			},
		];
	}

	async listResources(
		ctx: AppTriggerProviderContext,
		resourceType: string,
		query: { search?: string; cursor?: string },
	): Promise<AppTriggerResourceListResult> {
		if (resourceType !== 'gmail-label') return { options: [] };
		const response = await ctx.execute({ method: 'GET', url: `${GMAIL_API_BASE}/labels` });
		if (!response.ok) {
			const excerpt = await readErrorExcerpt(response);
			throw new Error(`Gmail labels.list failed (${response.status}): ${excerpt}`);
		}
		const body = (await response.json()) as { labels?: { id: string; name: string }[] };
		// labels.list has no query param and returns a small set — filter client-side, no paging.
		const term = (query.search ?? '').toLowerCase();
		const options = (body.labels ?? [])
			.filter((label) => !term || label.name.toLowerCase().includes(term))
			.map((label) => ({ value: label.id, label: label.name }));
		return { options };
	}

	async registerWebhook(
		ctx: AppTriggerProviderContext,
		_eventId: string,
		params: Record<string, unknown>,
		_deliveryUrl: string,
		state: AppTriggerState,
	): Promise<AppWebhookRegistration> {
		const topicName = this.resolveTopic(params);
		const labelId = typeof params.labelId === 'string' ? params.labelId.trim() : '';

		const body: Record<string, unknown> = { topicName };
		if (labelId) {
			body.labelIds = [labelId];
			body.labelFilterBehavior = 'INCLUDE';
		}

		const response = await ctx.execute({
			method: 'POST',
			url: `${GMAIL_API_BASE}/watch`,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		if (!response.ok) {
			const excerpt = await readErrorExcerpt(response);
			throw new Error(`Gmail users.watch failed (${response.status}): ${excerpt}`);
		}
		const watch = (await response.json()) as GmailWatchResponse;

		// Keep an existing cursor if we already had one (re-register on restart); otherwise
		// baseline at the watch's historyId so we only fetch deltas going forward.
		const existingCursor = typeof state.cursor === 'string' ? state.cursor : undefined;
		const baselineHistoryId = watch.historyId;
		return {
			expiresAt: watch.expiration ? new Date(Number(watch.expiration)).toISOString() : undefined,
			mode: 'auto',
			extra: {
				baselineHistoryId,
				cursor: existingCursor ?? baselineHistoryId,
			},
		};
	}

	async renewWebhook(
		ctx: AppTriggerProviderContext,
		eventId: string,
		params: Record<string, unknown>,
		deliveryUrl: string,
		state: AppTriggerState,
	): Promise<AppWebhookRegistration> {
		// users.watch is idempotent — re-issuing refreshes the expiration.
		return this.registerWebhook(ctx, eventId, params, deliveryUrl, state);
	}

	async unregisterWebhook(ctx: AppTriggerProviderContext): Promise<void> {
		// Best-effort — failure to stop should not block deactivation.
		try {
			await ctx.execute({ method: 'POST', url: `${GMAIL_API_BASE}/stop` });
		} catch {
			/* ignore */
		}
	}

	async handleWebhook(
		ctx: AppTriggerProviderContext,
		_eventId: string,
		params: Record<string, unknown>,
		state: AppTriggerState,
		req: AppWebhookRequest,
	): Promise<AppWebhookHandleResult> {
		// Decode the Pub/Sub push envelope: { message: { data: base64(JSON) }, subscription }.
		const envelope = this.parseEnvelope(req.rawBody);
		if (!envelope) {
			// Acknowledge malformed/empty deliveries so Pub/Sub doesn't redeliver forever.
			return { ok: true, events: [], response: { status: 204 } };
		}

		const startHistoryId =
			(typeof state.cursor === 'string' && state.cursor) ||
			state.baselineHistoryId ||
			envelope.historyId;
		if (!startHistoryId) {
			return { ok: true, events: [], stateUpdate: { cursor: envelope.historyId } };
		}

		const labelId = typeof params.labelId === 'string' ? params.labelId.trim() : '';
		const messageIds = await this.listNewMessageIds(ctx, startHistoryId, labelId);

		const events: NormalizedAppEvent[] = [];
		for (const id of messageIds) {
			const message = await this.fetchMessage(ctx, id);
			if (message) events.push(this.normalize(message));
		}

		return {
			ok: true,
			events,
			// Advance the cursor to the envelope's historyId for the next delta.
			stateUpdate: { cursor: envelope.historyId, lastPolledAt: new Date().toISOString() },
		};
	}

	private parseEnvelope(rawBody: Buffer): { historyId?: string; emailAddress?: string } | null {
		try {
			const outer = JSON.parse(rawBody.toString('utf-8')) as {
				message?: { data?: string };
			};
			const data = outer.message?.data;
			if (!data) return null;
			const decoded = Buffer.from(data, 'base64').toString('utf-8');
			const parsed = JSON.parse(decoded) as { historyId?: string | number; emailAddress?: string };
			return {
				historyId: parsed.historyId !== undefined ? String(parsed.historyId) : undefined,
				emailAddress: parsed.emailAddress,
			};
		} catch {
			return null;
		}
	}

	private async listNewMessageIds(
		ctx: AppTriggerProviderContext,
		startHistoryId: string,
		labelId: string,
	): Promise<string[]> {
		const qs: Record<string, string> = {
			startHistoryId,
			historyTypes: 'messageAdded',
		};
		if (labelId) qs.labelId = labelId;

		const response = await ctx.execute({ method: 'GET', url: `${GMAIL_API_BASE}/history`, qs });
		// A 404 means the startHistoryId is too old/expired — caller re-baselines via cursor advance.
		if (response.status === 404) return [];
		if (!response.ok) {
			const excerpt = await readErrorExcerpt(response);
			throw new Error(`Gmail history.list failed (${response.status}): ${excerpt}`);
		}
		const body = (await response.json()) as GmailHistoryList;
		const ids = new Set<string>();
		for (const record of body.history ?? []) {
			for (const added of record.messagesAdded ?? []) {
				if (added.message?.id) ids.add(added.message.id);
			}
		}
		return [...ids];
	}

	private async fetchMessage(
		ctx: AppTriggerProviderContext,
		id: string,
	): Promise<GmailMessage | null> {
		const response = await ctx.execute({
			method: 'GET',
			url: `${GMAIL_API_BASE}/messages/${encodeURIComponent(id)}`,
			qs: { format: 'full' },
		});
		if (response.status === 404) return null; // deleted between history + fetch
		if (!response.ok) {
			const excerpt = await readErrorExcerpt(response);
			throw new Error(`Gmail messages.get failed (${response.status}): ${excerpt}`);
		}
		return (await response.json()) as GmailMessage;
	}

	private normalize(message: GmailMessage): NormalizedAppEvent {
		const headers = message.payload?.headers ?? [];
		const header = (name: string): string =>
			headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
		const receivedAt = message.internalDate
			? new Date(Number(message.internalDate)).toISOString()
			: undefined;
		return {
			id: message.id,
			occurredAt: receivedAt,
			payload: {
				from: header('From'),
				to: header('To'),
				subject: header('Subject'),
				snippet: message.snippet ?? '',
				body: this.extractBody(message.payload),
				receivedAt,
				messageId: message.id,
				threadId: message.threadId,
				labels: message.labelIds ?? [],
				raw: message,
			},
		};
	}

	/** Depth-first search for the first text/plain (then text/html) body part. */
	private extractBody(part: GmailMessagePart | undefined): string {
		if (!part) return '';
		const decode = (data?: string): string =>
			data ? Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8') : '';

		const find = (node: GmailMessagePart, mime: string): string | null => {
			if (node.mimeType === mime && node.body?.data) return decode(node.body.data);
			for (const child of node.parts ?? []) {
				const found = find(child, mime);
				if (found) return found;
			}
			return null;
		};

		return find(part, 'text/plain') ?? find(part, 'text/html') ?? decode(part.body?.data);
	}

	private resolveTopic(params: Record<string, unknown>): string {
		const topic =
			(typeof params.pubsubTopic === 'string' && params.pubsubTopic.trim()) ||
			process.env.GOOGLE_PUBSUB_TOPIC ||
			'';
		if (!topic) {
			throw new Error(
				'Gmail trigger requires a Pub/Sub topic (params.pubsubTopic or GOOGLE_PUBSUB_TOPIC)',
			);
		}
		if (!/^projects\/[A-Za-z0-9_-]+\/topics\/[A-Za-z0-9._-]+$/.test(topic)) {
			throw new Error(`Invalid Pub/Sub topic name: ${topic}`);
		}
		return topic;
	}
}

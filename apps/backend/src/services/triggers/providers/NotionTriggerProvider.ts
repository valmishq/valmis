import { createHmac, timingSafeEqual } from 'crypto';
import type { AppTriggerEventInfo, AppTriggerState } from '@repo/types';
import { logger } from '../../../config/logger.js';
import {
	readErrorExcerpt,
	toStringArray,
	type AppTriggerProvider,
	type AppTriggerProviderContext,
	type AppTriggerResourceListResult,
	type AppWebhookHandleResult,
	type AppWebhookRegistration,
	type AppWebhookRequest,
	type NormalizedAppEvent,
} from '../AppTriggerProvider.js';

const NOTION_API = 'https://api.notion.com/v1';

interface NotionWebhookBody {
	verification_token?: string;
	type?: string;
	entity?: { id?: string; type?: string };
	data?: { updated_properties?: string[]; parent?: { id?: string; type?: string } };
	timestamp?: string;
}

interface NotionPage {
	id: string;
	url?: string;
	last_edited_time?: string;
	parent?: { type?: string; database_id?: string };
	properties?: Record<string, unknown>;
}

/**
 * Notion app trigger — push delivery via Notion webhook subscriptions.
 *
 * Notion webhook subscriptions are created in the integration's settings (no public
 * create API), so registerWebhook is a no-op and the user adds the delivery URL once
 * in their Notion integration. The first inbound POST carries a `verification_token`
 * which we capture, persist, and log (the user pastes it back into Notion to verify).
 * Subsequent events are verified via `X-Notion-Signature` (HMAC over the raw body with
 * the verification token), the changed page is fetched, filtered to the configured
 * database, and normalized.
 */
export class NotionTriggerProvider implements AppTriggerProvider {
	readonly id = 'notion';
	readonly displayName = 'Notion';
	readonly icon = '/logos/notion.svg';
	readonly compatibleCredentialTypes = ['notion-api', 'notion-oauth2'];
	readonly deliveryMode = 'webhook' as const;
	readonly setupNote =
		"In your Notion integration settings, add this trigger's delivery URL as a webhook. " +
		'Notion sends a one-time verification token to the URL — it is captured and logged here; ' +
		'paste it back into Notion to confirm. The integration must have access to the database.';

	listEvents(): AppTriggerEventInfo[] {
		return [
			{
				id: 'database.itemChanged',
				name: 'Database item created or updated',
				description:
					'Fires when a page in the chosen database is created or has its properties updated.',
				params: [
					{
						name: 'databaseId',
						label: 'Databases',
						type: 'resource',
						resource: { type: 'notion-database', multiple: true, searchable: true },
						required: true,
						description: 'Fire for changes in any of the selected databases.',
						placeholder: 'Select one or more databases',
					},
					{
						name: 'includeContentUpdates',
						label: 'Include content edits',
						type: 'boolean',
						required: false,
						description: 'Also fire on page content edits, not just property changes.',
						default: false,
					},
				],
				payloadShape:
					'{ pageId, databaseId, url, properties, changedProperties, lastEditedTime, eventType, raw }',
			},
		];
	}

	async listResources(
		ctx: AppTriggerProviderContext,
		resourceType: string,
		query: { search?: string; cursor?: string },
	): Promise<AppTriggerResourceListResult> {
		if (resourceType !== 'notion-database') return { options: [] };
		// Notion-Version is injected by the credential definition; filter to databases.
		const requestBody: Record<string, unknown> = {
			filter: { value: 'database', property: 'object' },
			page_size: 25,
		};
		if (query.search) requestBody.query = query.search;
		if (query.cursor) requestBody.start_cursor = query.cursor;

		const response = await ctx.execute({
			method: 'POST',
			url: `${NOTION_API}/search`,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(requestBody),
		});
		if (!response.ok) {
			const excerpt = await readErrorExcerpt(response);
			throw new Error(`Notion search failed (${response.status}): ${excerpt}`);
		}
		const body = (await response.json()) as {
			results?: { id: string; title?: { plain_text?: string }[] }[];
			has_more?: boolean;
			next_cursor?: string | null;
		};
		const options = (body.results ?? []).map((db) => ({
			value: db.id,
			label:
				(db.title ?? [])
					.map((t) => t.plain_text ?? '')
					.join('')
					.trim() || 'Untitled',
		}));
		return { options, nextCursor: body.has_more ? (body.next_cursor ?? undefined) : undefined };
	}

	// Notion has no public webhook-create API — the URL is added in the integration UI.
	async registerWebhook(): Promise<AppWebhookRegistration> {
		logger.info(
			{ provider: 'notion' },
			'[app-trigger] Notion webhook is configured in the integration settings (no API auto-register)',
		);
		return { mode: 'manual' };
	}

	async handleWebhook(
		ctx: AppTriggerProviderContext,
		_eventId: string,
		params: Record<string, unknown>,
		state: AppTriggerState,
		req: AppWebhookRequest,
	): Promise<AppWebhookHandleResult> {
		let body: NotionWebhookBody;
		try {
			body = JSON.parse(req.rawBody.toString('utf-8')) as NotionWebhookBody;
		} catch {
			return { ok: false, events: [] };
		}

		// One-time verification handshake — capture + persist + log the token.
		if (body.verification_token) {
			// logger.info(
			// 	{ provider: 'notion', verificationToken: body.verification_token },
			// 	'[app-trigger] captured Notion verification token — paste it into Notion to verify the URL',
			// );
			return {
				ok: true,
				events: [],
				response: { status: 200 },
				stateUpdate: { verificationToken: body.verification_token },
			};
		}

		// Verify the signature using the captured verification token.
		const token = state.verificationToken;
		if (!token || !this.verifySignature(token, req)) {
			return { ok: false, events: [] };
		}

		const eventType = body.type ?? '';
		const isPropertyChange = eventType.startsWith('page.properties_updated');
		const isCreate = eventType.startsWith('page.created');
		const isContentChange = eventType.startsWith('page.content_updated');
		const includeContent = params.includeContentUpdates === true;
		if (!isPropertyChange && !isCreate && !(includeContent && isContentChange)) {
			return { ok: true, events: [], response: { status: 200 } };
		}

		const pageId = body.entity?.id;
		if (!pageId || body.entity?.type !== 'page') {
			return { ok: true, events: [], response: { status: 200 } };
		}

		const targetDbs = toStringArray(params.databaseId).map((id) => this.normalizeId(id));
		const page = await this.fetchPage(ctx, pageId);
		if (!page || !targetDbs.includes(this.normalizeId(page.parent?.database_id))) {
			// Not in any watched database (or unreadable) — acknowledge without firing.
			return { ok: true, events: [], response: { status: 200 } };
		}

		const normalized: NormalizedAppEvent = {
			id: `${pageId}:${body.timestamp ?? page.last_edited_time ?? ''}`,
			occurredAt: body.timestamp ?? page.last_edited_time,
			payload: {
				pageId,
				databaseId: page.parent?.database_id,
				url: page.url,
				properties: page.properties ?? {},
				changedProperties: body.data?.updated_properties ?? [],
				lastEditedTime: page.last_edited_time,
				eventType,
				raw: body,
			},
		};
		return { ok: true, events: [normalized], response: { status: 200 } };
	}

	private verifySignature(token: string, req: AppWebhookRequest): boolean {
		const signature = req.headers['x-notion-signature'];
		if (!signature) return false;
		const expected = `sha256=${createHmac('sha256', token).update(req.rawBody).digest('hex')}`;
		const expectedBuf = Buffer.from(expected);
		const receivedBuf = Buffer.from(signature);
		return expectedBuf.length === receivedBuf.length && timingSafeEqual(expectedBuf, receivedBuf);
	}

	private async fetchPage(
		ctx: AppTriggerProviderContext,
		pageId: string,
	): Promise<NotionPage | null> {
		if (!/^[0-9a-fA-F-]+$/.test(pageId)) return null; // SSRF/path guard
		const response = await ctx.execute({
			method: 'GET',
			url: `${NOTION_API}/pages/${encodeURIComponent(pageId)}`,
		});
		if (response.status === 404) return null;
		if (!response.ok) {
			const excerpt = await readErrorExcerpt(response);
			throw new Error(`Notion pages.retrieve failed (${response.status}): ${excerpt}`);
		}
		return (await response.json()) as NotionPage;
	}

	/** Strip dashes + lowercase so dashed and undashed Notion ids compare equal. */
	private normalizeId(id: unknown): string {
		return typeof id === 'string' ? id.replace(/-/g, '').toLowerCase() : '';
	}
}

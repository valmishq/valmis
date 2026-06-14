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

const SLACK_API = 'https://slack.com/api';
/** Reject deliveries whose signed timestamp is older than this (replay-attack guard). */
const MAX_TIMESTAMP_SKEW_SEC = 5 * 60;

interface SlackEventCallback {
	type: string;
	challenge?: string;
	event?: {
		type?: string;
		channel?: string;
		user?: string;
		text?: string;
		ts?: string;
		subtype?: string;
		bot_id?: string;
	};
	event_id?: string;
	event_time?: number;
}

/**
 * Slack app trigger — push delivery via the Slack Events API.
 *
 * registerWebhook auto-configures the app's Event Subscriptions request URL via the
 * App Manifest API (apps.manifest.update) using a configuration token (rotated through
 * tooling.tokens.rotate). If no config token / app id is present on the credential, it
 * degrades to a manual setup (the user pastes the delivery URL into their Slack app) —
 * inbound verification + parsing still run automatically.
 *
 * Inbound deliveries are verified with the Slack signing secret (HMAC over
 * `v0:timestamp:rawBody`) and the url_verification challenge is answered automatically.
 */
export class SlackTriggerProvider implements AppTriggerProvider {
	readonly id = 'slack';
	readonly displayName = 'Slack';
	readonly icon = '/logos/slack.svg';
	readonly compatibleCredentialTypes = ['slack'];
	readonly deliveryMode = 'webhook' as const;
	readonly setupNote =
		'Add a Signing Secret to the Slack credential (required to verify events). To ' +
		'auto-register the request URL, also add an App Manifest configuration token and App ID; ' +
		'otherwise paste the delivery URL into your Slack app\'s Event Subscriptions manually.';

	listEvents(): AppTriggerEventInfo[] {
		return [
			{
				id: 'message.received',
				name: 'New message',
				description: 'Fires when a message is posted to a channel the app is subscribed to.',
				params: [
					{
						name: 'channel',
						label: 'Channels',
						type: 'resource',
						resource: { type: 'slack-channel', multiple: true, searchable: true },
						required: false,
						description: 'Only fire for the selected channels. Leave empty for all channels.',
						placeholder: 'All channels',
					},
				],
				payloadShape: '{ channel, user, text, ts, eventType, raw }',
			},
		];
	}

	async listResources(
		ctx: AppTriggerProviderContext,
		resourceType: string,
		query: { search?: string; cursor?: string },
	): Promise<AppTriggerResourceListResult> {
		if (resourceType !== 'slack-channel') return { options: [] };
		// conversations.list is a bot-token call — go through ctx.execute (not the manifest fetch).
		const qs: Record<string, string> = {
			types: 'public_channel,private_channel',
			exclude_archived: 'true',
			limit: '200',
		};
		if (query.cursor) qs.cursor = query.cursor;

		const response = await ctx.execute({
			method: 'GET',
			url: `${SLACK_API}/conversations.list`,
			qs,
		});
		if (!response.ok) {
			const excerpt = await readErrorExcerpt(response);
			throw new Error(`Slack conversations.list failed (${response.status}): ${excerpt}`);
		}
		const body = (await response.json()) as {
			ok: boolean;
			error?: string;
			channels?: { id: string; name: string }[];
			response_metadata?: { next_cursor?: string };
		};
		if (!body.ok) {
			throw new Error(`Slack conversations.list failed: ${body.error ?? 'unknown'}`);
		}
		// conversations.list has no name query param — filter the page client-side.
		const term = (query.search ?? '').toLowerCase();
		const options = (body.channels ?? [])
			.filter((channel) => !term || channel.name.toLowerCase().includes(term))
			.map((channel) => ({ value: channel.id, label: `#${channel.name}` }));
		const next = body.response_metadata?.next_cursor;
		return { options, nextCursor: next && next !== '' ? next : undefined };
	}

	async registerWebhook(
		ctx: AppTriggerProviderContext,
		_eventId: string,
		_params: Record<string, unknown>,
		deliveryUrl: string,
	): Promise<AppWebhookRegistration> {
		const data = await ctx.loadCredentialData();
		// Trim — pasted tokens/ids often carry stray whitespace or newlines, which Slack
		// rejects with `invalid_arguments`.
		const appId = typeof data.appId === 'string' ? data.appId.trim() : '';
		let configToken = typeof data.configToken === 'string' ? data.configToken.trim() : '';
		const configRefreshToken =
			typeof data.configRefreshToken === 'string' ? data.configRefreshToken.trim() : '';

		if (!appId || (!configToken && !configRefreshToken)) {
			logger.info(
				{ provider: 'slack' },
				'[app-trigger] Slack manifest auto-register skipped (no appId/configToken) — manual setup',
			);
			return { subscriptionId: appId || undefined, mode: 'manual' };
		}

		// Rotate the (short-lived) config token before using it, persisting the new pair.
		if (configRefreshToken) {
			const rotated = await this.rotateConfigToken(configRefreshToken);
			if (rotated) {
				configToken = rotated.token;
				await ctx.saveCredentialData({
					...data,
					configToken: rotated.token,
					configRefreshToken: rotated.refreshToken,
				});
			}
		}

		if (!configToken) {
			throw new Error(
				'Slack config token unavailable — provide a valid App Configuration access token ' +
					'(xoxe.xoxp-…), or a refresh token (xoxe-1-…) that can be rotated.',
			);
		}

		const manifest = await this.exportManifest(appId, configToken);
		const next = this.withEventSubscription(manifest, deliveryUrl);
		await this.updateManifest(appId, configToken, next);

		return { subscriptionId: appId, mode: 'auto' };
	}

	async renewWebhook(
		ctx: AppTriggerProviderContext,
		eventId: string,
		params: Record<string, unknown>,
		deliveryUrl: string,
	): Promise<AppWebhookRegistration> {
		return this.registerWebhook(ctx, eventId, params, deliveryUrl);
	}

	async unregisterWebhook(): Promise<void> {
		// No safe automatic teardown — clearing the request URL via the manifest can disable the
		// whole app. Leave the subscription in place; the trigger row being gone stops delivery
		// from mapping to a workflow (the route returns 401 for unknown triggers).
	}

	async handleWebhook(
		ctx: AppTriggerProviderContext,
		_eventId: string,
		params: Record<string, unknown>,
		_state: AppTriggerState,
		req: AppWebhookRequest,
	): Promise<AppWebhookHandleResult> {
		let body: SlackEventCallback;
		try {
			body = JSON.parse(req.rawBody.toString('utf-8')) as SlackEventCallback;
		} catch {
			return { ok: false, events: [] };
		}

		// URL verification handshake — Slack sends this when the request URL is set.
		if (body.type === 'url_verification' && body.challenge) {
			return { ok: true, events: [], response: { status: 200, body: { challenge: body.challenge } } };
		}

		// Verify the signing secret over the raw body.
		const data = await ctx.loadCredentialData();
		const signingSecret = typeof data.signingSecret === 'string' ? data.signingSecret : '';
		if (!signingSecret || !this.verifySignature(signingSecret, req)) {
			return { ok: false, events: [] };
		}

		if (body.type !== 'event_callback' || !body.event || body.event.type !== 'message') {
			// Acknowledge non-message callbacks without firing.
			return { ok: true, events: [], response: { status: 200, body: { ok: true } } };
		}

		const event = body.event;
		// Ignore bot/self messages and edits/deletes (subtype present).
		if (event.bot_id || event.subtype) {
			return { ok: true, events: [], response: { status: 200, body: { ok: true } } };
		}

		const channelFilter = toStringArray(params.channel);
		if (channelFilter.length && !channelFilter.includes(event.channel ?? '')) {
			return { ok: true, events: [], response: { status: 200, body: { ok: true } } };
		}

		const normalized: NormalizedAppEvent = {
			id: body.event_id ?? `${event.channel}:${event.ts}`,
			occurredAt: event.ts ? new Date(Number(event.ts) * 1000).toISOString() : undefined,
			payload: {
				channel: event.channel,
				user: event.user,
				text: event.text ?? '',
				ts: event.ts,
				eventType: event.type,
				raw: body,
			},
		};
		return { ok: true, events: [normalized], response: { status: 200, body: { ok: true } } };
	}

	private verifySignature(signingSecret: string, req: AppWebhookRequest): boolean {
		const timestamp = req.headers['x-slack-request-timestamp'];
		const signature = req.headers['x-slack-signature'];
		if (!timestamp || !signature) return false;

		const age = Math.abs(Date.now() / 1000 - Number(timestamp));
		if (!Number.isFinite(age) || age > MAX_TIMESTAMP_SKEW_SEC) return false;

		const base = `v0:${timestamp}:${req.rawBody.toString('utf-8')}`;
		const expected = `v0=${createHmac('sha256', signingSecret).update(base).digest('hex')}`;
		const expectedBuf = Buffer.from(expected);
		const receivedBuf = Buffer.from(signature);
		return expectedBuf.length === receivedBuf.length && timingSafeEqual(expectedBuf, receivedBuf);
	}

	private async rotateConfigToken(
		refreshToken: string,
	): Promise<{ token: string; refreshToken: string } | null> {
		const response = await fetch(`${SLACK_API}/tooling.tokens.rotate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ refresh_token: refreshToken }).toString(),
		});
		const json = (await response.json()) as {
			ok: boolean;
			token?: string;
			refresh_token?: string;
			error?: string;
			response_metadata?: { messages?: string[] };
		};
		if (!json.ok || !json.token || !json.refresh_token) {
			logger.warn(
				{ error: this.slackErrorDetail(json) },
				'[app-trigger] Slack config token rotation failed',
			);
			return null;
		}
		return { token: json.token, refreshToken: json.refresh_token };
	}

	/** Combine Slack's error code with its detailed `response_metadata.messages` (which says
	 *  exactly which argument is invalid) so failures are diagnosable from the logs/UI. */
	private slackErrorDetail(json: {
		error?: string;
		response_metadata?: { messages?: string[] };
	}): string {
		const code = json.error ?? 'unknown';
		const messages = json.response_metadata?.messages ?? [];
		return messages.length > 0 ? `${code} (${messages.join('; ')})` : code;
	}

	private async exportManifest(appId: string, configToken: string): Promise<Record<string, unknown>> {
		const response = await fetch(`${SLACK_API}/apps.manifest.export`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: `Bearer ${configToken}`,
			},
			body: new URLSearchParams({ app_id: appId }).toString(),
		});
		const json = (await response.json()) as {
			ok: boolean;
			manifest?: Record<string, unknown>;
			error?: string;
			response_metadata?: { messages?: string[] };
		};
		if (!json.ok || !json.manifest) {
			throw new Error(`Slack apps.manifest.export failed: ${this.slackErrorDetail(json)}`);
		}
		return json.manifest;
	}

	private withEventSubscription(
		manifest: Record<string, unknown>,
		deliveryUrl: string,
	): Record<string, unknown> {
		const settings = (manifest.settings as Record<string, unknown>) ?? {};
		const eventSubs = (settings.event_subscriptions as Record<string, unknown>) ?? {};
		const botEvents = new Set<string>([
			...((eventSubs.bot_events as string[]) ?? []),
			'message.channels',
		]);
		return {
			...manifest,
			settings: {
				...settings,
				event_subscriptions: {
					...eventSubs,
					request_url: deliveryUrl,
					bot_events: [...botEvents],
				},
			},
		};
	}

	private async updateManifest(
		appId: string,
		configToken: string,
		manifest: Record<string, unknown>,
	): Promise<void> {
		const response = await fetch(`${SLACK_API}/apps.manifest.update`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: `Bearer ${configToken}`,
			},
			body: new URLSearchParams({ app_id: appId, manifest: JSON.stringify(manifest) }).toString(),
		});
		if (!response.ok) {
			const excerpt = await readErrorExcerpt(response);
			throw new Error(`Slack apps.manifest.update failed (${response.status}): ${excerpt}`);
		}
		const json = (await response.json()) as {
			ok: boolean;
			error?: string;
			response_metadata?: { messages?: string[] };
		};
		if (!json.ok) {
			throw new Error(`Slack apps.manifest.update failed: ${this.slackErrorDetail(json)}`);
		}
	}
}

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ChannelService } from '../services/ChannelService.js';
import { logger } from '../config/logger.js';
import type { AuthService } from '../services/AuthService.js';
import type { AgentService } from '../services/AgentService.js';
import type { CredentialService } from '../services/CredentialService.js';
import type { TelegramPollerManager } from '../channels/telegram/poller-manager.js';
import type { DiscordGatewayManager } from '../channels/discord/gateway-manager.js';
import type {
	ChannelLinkResponse,
	ChannelLinksListResponse,
	ChannelLinkDeleteResponse,
	ChannelPairingCodeResponse,
	GeneratePairingCodeRequestBody,
	UpdateChannelLinkRequestBody,
	ChannelType,
} from '@repo/types';

/** External channels a pairing code can be generated for ('web' never pairs) */
const EXTERNAL_CHANNELS: ChannelType[] = ['telegram', 'whatsapp', 'discord'];

/**
 * Channel management routes (all JWT auth):
 *   POST   /v1/channels/pairing-codes          — generate a one-time pairing code
 *   GET    /v1/channels/links                  — list all channel links for the user
 *   PATCH  /v1/channels/links/:linkId          — update link settings
 *   DELETE /v1/channels/links/:linkId          — unpair (delete link)
 *
 * Pairing codes are consumed exclusively through the bot adapters (the /pair
 * command handled in channels/commands.ts) — there is deliberately no public
 * HTTP endpoint for code consumption, to keep the brute-force surface limited
 * to authenticated bot conversations.
 */
export function createChannelsRouter(
	authService: AuthService,
	channelService: ChannelService,
	agentService: AgentService,
	credentialService: CredentialService,
	telegramPollerManager: TelegramPollerManager,
	discordGatewayManager: DiscordGatewayManager,
): Router {
	const router = Router();
	const auth = requireAuth(authService);

	// ─── User-facing routes (JWT auth) ────────────────────────────────────────

	/**
	 * POST /v1/channels/pairing-codes
	 * Generate a 6-character one-time pairing code.
	 * Body: { channel: ChannelType, agentId: string }
	 */
	router.post('/pairing-codes', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		const { channel, agentId, credentialId } = req.body as GeneratePairingCodeRequestBody & {
			credentialId?: string;
		};

		if (!channel || !agentId) {
			res.status(400).json({ success: false, error: 'channel and agentId are required' });
			return;
		}

		if (!EXTERNAL_CHANNELS.includes(channel as ChannelType)) {
			res.status(400).json({ success: false, error: 'Unsupported channel' });
			return;
		}

		try {
			// Ownership checks — a pairing code must only ever bind agents and
			// credentials that belong to the requesting user.
			const agent = await agentService.getById(agentId, ownerId);
			if (!agent) {
				res.status(404).json({ success: false, error: 'Agent not found' });
				return;
			}

			if (credentialId) {
				const credential = await credentialService.getById(credentialId, ownerId);
				if (!credential) {
					res.status(404).json({ success: false, error: 'Credential not found' });
					return;
				}
			}

			const pairingCode = await channelService.generatePairingCode(
				ownerId,
				channel as ChannelType,
				agentId,
				credentialId,
			);

			// For Telegram: ensure the poller is running for this bot credential
			// so it can receive the /pair command as soon as the user sends it.
			if (channel === 'telegram' && credentialId) {
				telegramPollerManager.ensurePolling(credentialId).catch((err: unknown) => {
					logger.warn({ err, credentialId }, '[channels] failed to start Telegram poller');
				});
			}

			// For Discord: ensure the Gateway connection is running for this bot credential
			// so it can receive the /pair command via DM as soon as the user sends it.
			if (channel === 'discord' && credentialId) {
				discordGatewayManager.ensureGateway(credentialId).catch((err: unknown) => {
					logger.warn({ err, credentialId }, '[channels] failed to start Discord gateway');
				});
			}

			const body: ChannelPairingCodeResponse = {
				success: true,
				data: { code: pairingCode.code, expiresAt: pairingCode.expiresAt },
			};
			res.status(201).json(body);
		} catch (err) {
			logger.error({ err }, '[channels] failed to generate pairing code');
			res.status(500).json({ success: false, error: 'Failed to generate pairing code' });
		}
	});

	/**
	 * GET /v1/channels/links
	 * List all channel links for the authenticated user.
	 */
	router.get('/links', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		try {
			const links = await channelService.listLinksByUser(ownerId);
			const body: ChannelLinksListResponse = { success: true, data: links };
			res.json(body);
		} catch (err) {
			logger.error({ err }, '[channels] failed to list links');
			res.status(500).json({ success: false, error: 'Failed to list channel links' });
		}
	});

	/**
	 * PATCH /v1/channels/links/:linkId
	 * Update mutable channel link settings (agent, threadMode, sessionTimeoutMin, notifyToolUsage).
	 */
	router.patch('/links/:linkId', auth, async (req: Request, res: Response) => {
		const { linkId } = req.params as { linkId: string };
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		const updates = req.body as UpdateChannelLinkRequestBody;

		try {
			const updated = await channelService.updateLink(linkId, ownerId, updates);
			if (!updated) {
				res.status(404).json({ success: false, error: 'Channel link not found' });
				return;
			}

			const body: ChannelLinkResponse = { success: true, data: updated };
			res.json(body);
		} catch (err) {
			logger.error({ err, linkId }, '[channels] failed to update link');
			res.status(500).json({ success: false, error: 'Failed to update channel link' });
		}
	});

	/**
	 * DELETE /v1/channels/links/:linkId
	 * Unpair (delete) a channel link.
	 * If the deleted link was the last one using its bot credential, the
	 * credential's poller/gateway is stopped so the bot token is released.
	 */
	router.delete('/links/:linkId', auth, async (req: Request, res: Response) => {
		const { linkId } = req.params as { linkId: string };
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		try {
			// Fetch before deleting — we need channel + credentialId for cleanup
			const link = await channelService.getLinkById(linkId, ownerId);
			if (!link) {
				const body: ChannelLinkDeleteResponse = {
					success: false,
					error: 'Channel link not found',
				};
				res.status(404).json(body);
				return;
			}

			await channelService.deleteLink(linkId, ownerId);

			if (link.credentialId) {
				const remaining = await channelService.listLinksByCredential(
					link.channel,
					link.credentialId,
				);
				if (remaining.length === 0) {
					if (link.channel === 'telegram') telegramPollerManager.stopPoller(link.credentialId);
					if (link.channel === 'discord') discordGatewayManager.stopGateway(link.credentialId);
				}
			}

			const body: ChannelLinkDeleteResponse = { success: true, data: { deleted: true } };
			res.json(body);
		} catch (err) {
			logger.error({ err, linkId }, '[channels] failed to delete link');
			res.status(500).json({ success: false, error: 'Failed to delete channel link' });
		}
	});

	return router;
}

import { randomInt } from 'node:crypto';
import { eq, and, lt, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { channelLinks, channelPairingCodes } from '../db/schema/index.js';
import { logger } from '../config/logger.js';
import type {
	ChannelLink,
	ChannelType,
	ChannelThreadMode,
	ChannelPairingCode,
	UpdateChannelLinkRequestBody,
} from '@repo/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a random 6-character alphanumeric code.
 * Uses crypto.randomInt — pairing codes are bearer secrets, so the RNG must be
 * unpredictable (Math.random is not cryptographically secure).
 */
function generateCode(): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude ambiguous chars (0,O,1,I)
	let result = '';
	for (let i = 0; i < 6; i++) {
		result += chars[randomInt(chars.length)];
	}
	return result;
}

function rowToLink(row: typeof channelLinks.$inferSelect): ChannelLink {
	return {
		id: row.id,
		userId: row.userId,
		channel: row.channel as ChannelType,
		externalId: row.externalId,
		agentId: row.agentId,
		activeThreadId: row.activeThreadId ?? undefined,
		threadMode: row.threadMode as ChannelThreadMode,
		sessionTimeoutMin: row.sessionTimeoutMin,
		notifyToolUsage: row.notifyToolUsage,
		displayName: row.displayName ?? undefined,
		credentialId: row.credentialId ?? undefined,
		isVerified: row.isVerified,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function rowToPairingCode(row: typeof channelPairingCodes.$inferSelect): ChannelPairingCode {
	return {
		id: row.id,
		userId: row.userId,
		code: row.code,
		channel: row.channel as ChannelType,
		agentId: row.agentId,
		expiresAt: row.expiresAt,
		consumedAt: row.consumedAt ?? undefined,
	};
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Manages channel links (pairings) and pairing codes.
 *
 * A channel link connects an external platform identity (e.g. Telegram chat_id)
 * to an internal user account + agent. Pairing codes are one-time tokens that
 * the user sends to the bot to establish the link.
 */
export class ChannelService {
	// ─── Pairing codes ────────────────────────────────────────────────────

	/**
	 * Generate a 6-character alphanumeric pairing code for a user.
	 * TTL: 10 minutes.
	 *
	 * @param credentialId - For external channels (telegram, etc.), the credential
	 *   holding the bot token. Passed through to the channel_link when consumed.
	 *   Null for the web channel.
	 */
	async generatePairingCode(
		userId: string,
		channel: ChannelType,
		agentId: string,
		credentialId?: string,
	): Promise<ChannelPairingCode> {
		const code = generateCode();
		const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

		const [row] = await db
			.insert(channelPairingCodes)
			.values({
				userId,
				code,
				channel,
				agentId,
				credentialId: credentialId ?? null,
				expiresAt,
			})
			.returning();

		logger.info({ userId, channel, code }, '[channel] pairing code generated');
		return rowToPairingCode(row);
	}

	/**
	 * Validate and consume a pairing code.
	 * Returns the code record if valid, null if not found / expired / already consumed.
	 *
	 * Security:
	 *   - Checks code + channel match (platform-specific — prevents Telegram codes
	 *     being used on WhatsApp)
	 *   - Checks expiresAt > now
	 *   - Single-use is enforced atomically: the consume UPDATE is conditioned on
	 *     consumed_at IS NULL, so of two concurrent consumers only one can win.
	 *
	 * Returns the raw DB row so callers can access credentialId.
	 */
	async consumePairingCode(
		code: string,
		channel: string,
	): Promise<(ChannelPairingCode & { credentialId?: string }) | null> {
		const rows = await db
			.select()
			.from(channelPairingCodes)
			.where(
				and(
					eq(channelPairingCodes.code, code.toUpperCase()),
					eq(channelPairingCodes.channel, channel),
				),
			)
			.limit(1);

		const row = rows[0];
		if (!row) {
			logger.debug({ code, channel }, '[channel] pairing code not found');
			return null;
		}

		if (row.consumedAt !== null) {
			logger.warn({ code, channel }, '[channel] pairing code already consumed');
			return null;
		}

		if (row.expiresAt < new Date()) {
			logger.warn({ code, channel }, '[channel] pairing code expired');
			return null;
		}

		// Mark consumed atomically — conditioning on consumed_at IS NULL guarantees
		// that two concurrent /pair attempts cannot both succeed (TOCTOU guard).
		const consumed = await db
			.update(channelPairingCodes)
			.set({ consumedAt: new Date() })
			.where(and(eq(channelPairingCodes.id, row.id), isNull(channelPairingCodes.consumedAt)))
			.returning({ id: channelPairingCodes.id });

		if (consumed.length === 0) {
			logger.warn({ code, channel }, '[channel] pairing code consumed by concurrent request');
			return null;
		}

		logger.info({ userId: row.userId, channel, code }, '[channel] pairing code consumed');
		return {
			...rowToPairingCode({ ...row, consumedAt: new Date() }),
			credentialId: row.credentialId ?? undefined,
		};
	}

	/** Delete expired and consumed pairing codes (maintenance utility). */
	async cleanupExpiredCodes(): Promise<void> {
		await db.delete(channelPairingCodes).where(lt(channelPairingCodes.expiresAt, new Date()));
	}

	// ─── Channel links ─────────────────────────────────────────────────────

	/**
	 * Create or update a channel link after successful pairing.
	 * If a link already exists for (channel, externalId) it is updated in-place
	 * (the user may re-pair to switch the associated agent).
	 */
	async upsertLink(input: {
		userId: string;
		channel: string;
		externalId: string;
		agentId: string;
		credentialId?: string;
		displayName?: string;
	}): Promise<ChannelLink> {
		const now = new Date();

		const [row] = await db
			.insert(channelLinks)
			.values({
				userId: input.userId,
				channel: input.channel,
				externalId: input.externalId,
				agentId: input.agentId,
				credentialId: input.credentialId ?? null,
				displayName: input.displayName ?? null,
				isVerified: true,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [channelLinks.channel, channelLinks.externalId],
				set: {
					userId: input.userId,
					agentId: input.agentId,
					credentialId: input.credentialId ?? null,
					displayName: input.displayName ?? null,
					isVerified: true,
					updatedAt: now,
				},
			})
			.returning();

		logger.info(
			{ userId: input.userId, channel: input.channel, externalId: input.externalId },
			'[channel] link upserted',
		);
		return rowToLink(row);
	}

	/** Find a channel link by platform identity (channel + externalId). */
	async getLinkByExternalId(channel: string, externalId: string): Promise<ChannelLink | null> {
		const rows = await db
			.select()
			.from(channelLinks)
			.where(and(eq(channelLinks.channel, channel), eq(channelLinks.externalId, externalId)))
			.limit(1);
		return rows[0] ? rowToLink(rows[0]) : null;
	}

	/** Get a channel link by its ID (with ownership check). */
	async getLinkById(id: string, userId: string): Promise<ChannelLink | null> {
		const rows = await db
			.select()
			.from(channelLinks)
			.where(and(eq(channelLinks.id, id), eq(channelLinks.userId, userId)))
			.limit(1);
		return rows[0] ? rowToLink(rows[0]) : null;
	}

	/** List all channel links owned by a user. */
	async listLinksByUser(userId: string): Promise<ChannelLink[]> {
		const rows = await db.select().from(channelLinks).where(eq(channelLinks.userId, userId));
		return rows.map(rowToLink);
	}

	/**
	 * List all verified channel links for a given channel and credentialId.
	 * Used by the poller manager to find which bots to start polling on startup.
	 */
	async listLinksByCredential(channel: string, credentialId: string): Promise<ChannelLink[]> {
		const rows = await db
			.select()
			.from(channelLinks)
			.where(
				and(
					eq(channelLinks.channel, channel),
					eq(channelLinks.credentialId, credentialId),
					eq(channelLinks.isVerified, true),
				),
			);
		return rows.map(rowToLink);
	}

	/**
	 * List unique credentialIds for all verified telegram channel links.
	 * Used at startup to bootstrap the poller manager.
	 */
	async listActiveCredentialIds(channel: string): Promise<string[]> {
		const rows = await db
			.selectDistinct({ credentialId: channelLinks.credentialId })
			.from(channelLinks)
			.where(and(eq(channelLinks.channel, channel), eq(channelLinks.isVerified, true)));
		return rows
			.map((r) => r.credentialId)
			.filter((id): id is string => id !== null && id !== undefined);
	}

	/**
	 * Update mutable channel link settings (ownership enforced).
	 * Returns null if the link was not found or doesn't belong to the user.
	 */
	async updateLink(
		id: string,
		userId: string,
		updates: UpdateChannelLinkRequestBody,
	): Promise<ChannelLink | null> {
		const setValues: Partial<typeof channelLinks.$inferInsert> = {
			updatedAt: new Date(),
		};

		if (updates.agentId !== undefined) setValues.agentId = updates.agentId;
		if (updates.threadMode !== undefined) setValues.threadMode = updates.threadMode;
		if (updates.sessionTimeoutMin !== undefined)
			setValues.sessionTimeoutMin = updates.sessionTimeoutMin;
		if (updates.notifyToolUsage !== undefined) setValues.notifyToolUsage = updates.notifyToolUsage;

		const rows = await db
			.update(channelLinks)
			.set(setValues)
			.where(and(eq(channelLinks.id, id), eq(channelLinks.userId, userId)))
			.returning();

		return rows[0] ? rowToLink(rows[0]) : null;
	}

	/**
	 * Update the active thread for a channel link.
	 * Called by the channel router after auto-creating a thread or switching
	 * via /new or /thread command.
	 * No ownership check — called internally by the channel adapter.
	 */
	async setActiveThread(id: string, activeThreadId: string | null): Promise<void> {
		await db
			.update(channelLinks)
			.set({ activeThreadId, updatedAt: new Date() })
			.where(eq(channelLinks.id, id));
	}

	/**
	 * Delete a channel link (unpair) — ownership enforced.
	 * Returns true if the link was deleted, false if not found.
	 */
	async deleteLink(id: string, userId: string): Promise<boolean> {
		const rows = await db
			.delete(channelLinks)
			.where(and(eq(channelLinks.id, id), eq(channelLinks.userId, userId)))
			.returning({ id: channelLinks.id });
		return rows.length > 0;
	}
}

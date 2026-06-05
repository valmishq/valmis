import { eq, and } from 'drizzle-orm';
import * as nodeCron from 'node-cron';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { db } from '../db/index.js';
import { agentTriggers, agents } from '../db/schema/index.js';
import type {
	AgentTrigger,
	AgentTriggerKind,
	AgentTriggerConfig,
	CronTriggerConfig,
	WebhookTriggerConfig,
} from '@repo/types';
import { AgentRuntimeService } from './AgentRuntimeService.js';
import { AgentSessionService } from './AgentSessionService.js';
import { logger } from '../config/logger.js';

// ─── Mappers ──────────────────────────────────────────────────────────────────

function rowToTrigger(row: typeof agentTriggers.$inferSelect): AgentTrigger {
	return {
		id: row.id,
		agentId: row.agentId,
		ownerId: row.ownerId,
		kind: row.kind as AgentTriggerKind,
		name: row.name,
		config: row.config as AgentTriggerConfig,
		isEnabled: row.isEnabled,
		lastFiredAt: row.lastFiredAt ?? undefined,
		description: row.description ?? undefined,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum consecutive cron execution failures before a trigger is automatically disabled.
 * After this threshold the trigger is set isEnabled=false and an error is logged.
 * This prevents a persistently failing cron from silently burning resources.
 */
const MAX_CONSECUTIVE_CRON_FAILURES = 5;

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Manages agent trigger CRUD and cron scheduling.
 *
 * Lifecycle:
 *   1. On backend startup, call TriggerService.loadAll() to schedule all enabled cron triggers.
 *   2. When a trigger is created/updated/deleted, the in-memory scheduler is updated in-place.
 *   3. Webhook triggers are fired externally via TriggerService.fireWebhookTrigger().
 *   4. Manual triggers are fired via TriggerService.fireManualTrigger().
 *
 * Cron scheduling:
 *   - Uses node-cron, which runs in the host process.
 *   - Each enabled cron trigger gets one ScheduledTask stored in cronJobs map.
 *   - On disable/delete, the task is stopped and removed.
 *   - After MAX_CONSECUTIVE_CRON_FAILURES consecutive failures the trigger is auto-disabled.
 */
export class TriggerService {
	/** In-memory map of cron tasks keyed by trigger ID */
	private readonly cronJobs = new Map<string, nodeCron.ScheduledTask>();

	/**
	 * Tracks consecutive failure counts for cron triggers.
	 * Reset to 0 on a successful execution. Auto-disable fires at MAX_CONSECUTIVE_CRON_FAILURES.
	 */
	private readonly cronFailureCounts = new Map<string, number>();

	constructor(
		private readonly runtimeService: AgentRuntimeService,
		private readonly sessionService: AgentSessionService,
	) {}

	// ─── CRUD ──────────────────────────────────────────────────────────────

	/** Create a new trigger */
	async create(input: {
		agentId: string;
		ownerId: string;
		kind: AgentTriggerKind;
		name: string;
		config: AgentTriggerConfig;
		description?: string;
	}): Promise<AgentTrigger> {
		// For webhook triggers, generate a secret if not provided
		let config = input.config;
		if (input.kind === 'webhook' && !(config as WebhookTriggerConfig).secret) {
			config = { secret: randomBytes(32).toString('hex') } as WebhookTriggerConfig;
		}

		const now = new Date();
		const [row] = await db
			.insert(agentTriggers)
			.values({
				agentId: input.agentId,
				ownerId: input.ownerId,
				kind: input.kind,
				name: input.name,
				config,
				isEnabled: true,
				description: input.description ?? null,
				createdAt: now,
				updatedAt: now,
			})
			.returning();

		const trigger = rowToTrigger(row);

		// Schedule immediately if cron
		if (trigger.kind === 'cron' && trigger.isEnabled) {
			this.scheduleCron(trigger);
		}

		return trigger;
	}

	/** List triggers for an agent */
	async listByAgent(agentId: string, ownerId: string): Promise<AgentTrigger[]> {
		// Verify agent ownership
		const agentRows = await db
			.select({ id: agents.id })
			.from(agents)
			.where(and(eq(agents.id, agentId), eq(agents.ownerId, ownerId)))
			.limit(1);
		if (!agentRows[0]) return [];

		const rows = await db
			.select()
			.from(agentTriggers)
			.where(and(eq(agentTriggers.agentId, agentId), eq(agentTriggers.ownerId, ownerId)));
		return rows.map(rowToTrigger);
	}

	/** Get a trigger by ID with ownership check */
	async getById(id: string, ownerId: string): Promise<AgentTrigger | null> {
		const rows = await db
			.select()
			.from(agentTriggers)
			.where(and(eq(agentTriggers.id, id), eq(agentTriggers.ownerId, ownerId)))
			.limit(1);
		return rows[0] ? rowToTrigger(rows[0]) : null;
	}

	/** Get a trigger by ID without ownership check (for webhook validation) */
	async getByIdInternal(id: string): Promise<AgentTrigger | null> {
		const rows = await db.select().from(agentTriggers).where(eq(agentTriggers.id, id)).limit(1);
		return rows[0] ? rowToTrigger(rows[0]) : null;
	}

	/** Update a trigger's config or enabled state */
	async update(
		id: string,
		ownerId: string,
		input: {
			name?: string;
			config?: AgentTriggerConfig;
			isEnabled?: boolean;
			description?: string;
		},
	): Promise<AgentTrigger | null> {
		const existing = await this.getById(id, ownerId);
		if (!existing) return null;

		const updates: Partial<{
			name: string;
			config: AgentTriggerConfig;
			isEnabled: boolean;
			description: string | null;
			updatedAt: Date;
		}> = { updatedAt: new Date() };

		if (input.name !== undefined) updates.name = input.name;
		if (input.config !== undefined) updates.config = input.config;
		if (input.isEnabled !== undefined) updates.isEnabled = input.isEnabled;
		if (input.description !== undefined) updates.description = input.description ?? null;

		await db
			.update(agentTriggers)
			.set(updates)
			.where(and(eq(agentTriggers.id, id), eq(agentTriggers.ownerId, ownerId)));

		const updated = await this.getById(id, ownerId);
		if (!updated) return null;

		// Reschedule cron if needed
		if (updated.kind === 'cron') {
			this.unscheduleCron(id);
			if (updated.isEnabled) {
				this.scheduleCron(updated);
			}
		}

		return updated;
	}

	/** Delete a trigger */
	async delete(id: string, ownerId: string): Promise<boolean> {
		const existing = await this.getById(id, ownerId);
		if (!existing) return false;

		// Stop cron job if running
		this.unscheduleCron(id);

		const result = await db
			.delete(agentTriggers)
			.where(and(eq(agentTriggers.id, id), eq(agentTriggers.ownerId, ownerId)));
		return (result.rowCount ?? 0) > 0;
	}

	// ─── Trigger Firing ───────────────────────────────────────────────────

	/**
	 * Fire a webhook trigger after verifying the HMAC signature.
	 * Called by the webhook route handler.
	 *
	 * @param triggerId  The trigger ID from the URL
	 * @param signature  X-Hub-Signature-256 header value (e.g. "sha256=<hex>")
	 * @param rawBody    Raw request body as a Buffer (for accurate HMAC)
	 * @param payload    Parsed request body
	 */
	async fireWebhookTrigger(
		triggerId: string,
		signature: string,
		rawBody: Buffer,
		payload: Record<string, unknown>,
	): Promise<void> {
		const trigger = await this.getByIdInternal(triggerId);
		if (!trigger) {
			throw new Error(`Trigger not found: ${triggerId}`);
		}
		if (!trigger.isEnabled) {
			throw new Error(`Trigger ${triggerId} is disabled`);
		}
		if (trigger.kind !== 'webhook') {
			throw new Error(`Trigger ${triggerId} is not a webhook trigger`);
		}

		// Verify HMAC signature using a constant-time comparison to prevent timing attacks.
		const secret = (trigger.config as WebhookTriggerConfig).secret;
		const expectedSig = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
		const expectedBuf = Buffer.from(expectedSig);
		const receivedBuf = Buffer.from(signature);
		const signaturesMatch =
			expectedBuf.length === receivedBuf.length && timingSafeEqual(expectedBuf, receivedBuf);
		if (!signaturesMatch) {
			throw new Error('Invalid webhook signature');
		}

		await this.fireTrigger(trigger, { headers: {}, body: payload });
	}

	/** Fire a manual trigger (user-initiated) */
	async fireManualTrigger(triggerId: string, ownerId: string): Promise<void> {
		const trigger = await this.getById(triggerId, ownerId);
		if (!trigger) throw new Error(`Trigger not found: ${triggerId}`);
		if (!trigger.isEnabled) throw new Error(`Trigger ${triggerId} is disabled`);
		if (trigger.kind !== 'manual') throw new Error(`Trigger ${triggerId} is not a manual trigger`);

		await this.fireTrigger(trigger, { firedAt: new Date().toISOString() });
	}

	// ─── Startup ──────────────────────────────────────────────────────────

	/**
	 * Load all enabled cron triggers from the DB and schedule them.
	 * Call this once at server startup.
	 */
	async loadAll(): Promise<void> {
		const rows = await db
			.select()
			.from(agentTriggers)
			.where(and(eq(agentTriggers.kind, 'cron'), eq(agentTriggers.isEnabled, true)));

		let scheduled = 0;
		for (const row of rows) {
			const trigger = rowToTrigger(row);
			try {
				this.scheduleCron(trigger);
				scheduled++;
			} catch (err) {
				logger.error({ err, triggerId: trigger.id }, '[triggers] failed to schedule cron trigger');
			}
		}
		logger.info({ scheduled }, '[triggers] loaded and scheduled cron triggers');
	}

	// ─── Private ──────────────────────────────────────────────────────────

	/**
	 * Common trigger fire logic: create a thread and spawn a container.
	 */
	private async fireTrigger(
		trigger: AgentTrigger,
		payload: Record<string, unknown>,
	): Promise<void> {
		logger.info(
			{ triggerId: trigger.id, agentId: trigger.agentId, kind: trigger.kind },
			'[triggers] firing trigger',
		);

		// Create a thread for this trigger execution
		const thread = await this.sessionService.createThread({
			agentId: trigger.agentId,
			ownerId: trigger.ownerId,
			title: `${trigger.name} — ${new Date().toISOString()}`,
			triggerType: trigger.kind,
			triggerId: trigger.id,
			triggerPayload: payload,
		});

		// Spawn the container
		await this.runtimeService.spawnForThread(
			trigger.agentId,
			thread.id,
			trigger.ownerId,
			trigger.kind,
			payload,
		);

		// Update lastFiredAt
		await db
			.update(agentTriggers)
			.set({ lastFiredAt: new Date(), updatedAt: new Date() })
			.where(eq(agentTriggers.id, trigger.id));
	}

	/** Register a node-cron job for a trigger */
	private scheduleCron(trigger: AgentTrigger): void {
		const config = trigger.config as CronTriggerConfig;
		const schedule = config.schedule;
		const timezone = config.timezone;

		if (!nodeCron.validate(schedule)) {
			logger.warn(
				{ triggerId: trigger.id, schedule },
				'[triggers] invalid cron schedule, skipping',
			);
			return;
		}

		const task = nodeCron.schedule(
			schedule,
			async () => {
				try {
					await this.fireTrigger(trigger, { firedAt: new Date().toISOString() });
					// Reset failure counter on success
					this.cronFailureCounts.delete(trigger.id);
				} catch (err) {
					const failures = (this.cronFailureCounts.get(trigger.id) ?? 0) + 1;
					this.cronFailureCounts.set(trigger.id, failures);

					logger.error(
						{ err, triggerId: trigger.id, consecutiveFailures: failures },
						'[triggers] cron trigger execution failed',
					);

					// Auto-disable after too many consecutive failures to prevent silent resource burn
					if (failures >= MAX_CONSECUTIVE_CRON_FAILURES) {
						logger.error(
							{ triggerId: trigger.id, failures },
							'[triggers] auto-disabling trigger after repeated consecutive failures',
						);
						this.unscheduleCron(trigger.id);
						try {
							await this.update(trigger.id, trigger.ownerId, { isEnabled: false });
						} catch (disableErr) {
							logger.error(
								{ disableErr, triggerId: trigger.id },
								'[triggers] failed to auto-disable trigger in DB',
							);
						}
					}
				}
			},
			{ timezone },
		);

		this.cronJobs.set(trigger.id, task);
		logger.info({ triggerId: trigger.id, schedule, timezone }, '[triggers] cron scheduled');
	}

	/** Stop and remove a cron job */
	private unscheduleCron(triggerId: string): void {
		const task = this.cronJobs.get(triggerId);
		if (task) {
			task.stop();
			this.cronJobs.delete(triggerId);
			logger.info({ triggerId }, '[triggers] cron unscheduled');
		}
	}
}

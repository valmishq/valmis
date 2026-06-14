import { eq, and, desc, inArray } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { workflows, agents, agentTriggers } from '../db/schema/index.js';
import { validateWorkflowCreate, validateWorkflowUpdate } from '@repo/utils';
import type {
	Workflow,
	WorkflowStep,
	WorkflowTriggerInput,
	AgentTrigger,
	AgentTriggerKind,
	AgentTriggerConfig,
	AppTriggerConfig,
	CronTriggerConfig,
	WebhookTriggerConfig,
} from '@repo/types';

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
		workflowId: row.workflowId ?? undefined,
		appRegistration: appRegistrationFromState(row.kind, row.state),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

/** Surface app-trigger registration status from the runtime state column (app triggers only). */
function appRegistrationFromState(
	kind: string,
	state: unknown,
): AgentTrigger['appRegistration'] {
	if (kind !== 'app' || !state || typeof state !== 'object') return undefined;
	const s = state as {
		registeredAt?: string;
		lastRegisterError?: string;
		registrationMode?: 'auto' | 'manual';
		verificationToken?: string;
	};
	if (!s.registeredAt && !s.lastRegisterError && !s.verificationToken) return undefined;
	return {
		registeredAt: s.registeredAt,
		error: s.lastRegisterError,
		mode: s.registrationMode,
		verificationToken: s.verificationToken,
	};
}

function rowToWorkflow(row: typeof workflows.$inferSelect, trigger?: AgentTrigger): Workflow {
	return {
		id: row.id,
		agentId: row.agentId,
		ownerId: row.ownerId,
		name: row.name,
		description: row.description ?? undefined,
		steps: row.steps as WorkflowStep[],
		isEnabled: row.isEnabled,
		trigger,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the trigger config from the user-supplied input.
 *
 * For webhooks, the HMAC secret is server-generated and must survive updates:
 * clients never send it (the builder submits only { requireSignature }), so the
 * stored config takes precedence. A new secret is generated only when there is
 * no stored one — on create or when the trigger kind changes.
 */
function buildTriggerConfig(
	kind: AgentTriggerKind,
	inputConfig?: AgentTriggerConfig,
	storedConfig?: AgentTriggerConfig,
): AgentTriggerConfig {
	if (kind === 'webhook') {
		const input = inputConfig as WebhookTriggerConfig | undefined;
		const stored = storedConfig as WebhookTriggerConfig | undefined;
		const secret = stored?.secret ?? input?.secret ?? randomBytes(32).toString('hex');
		const requireSignature = input?.requireSignature ?? stored?.requireSignature ?? true;
		const config: WebhookTriggerConfig = { secret, requireSignature };
		return config;
	}
	if (kind === 'cron') {
		// Return provided config, or a placeholder default
		return (inputConfig as CronTriggerConfig) ?? ({ schedule: '0 9 * * *' } as CronTriggerConfig);
	}
	if (kind === 'app') {
		// App trigger config (provider/event/credentialId/params) is fully user-supplied.
		// Runtime listening state (cursor/subscription) lives in the separate
		// agent_triggers.state column, so nothing needs to be preserved here across updates.
		return (inputConfig as AppTriggerConfig) ?? ({} as AgentTriggerConfig);
	}
	// manual — no config needed
	return {} as AgentTriggerConfig;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * CRUD service for workflow definitions.
 *
 * All writes go through validateWorkflowCreate/Update (Zod) before any DB operation.
 * Ownership is enforced by joining against the agents table on every query.
 *
 * Trigger lifecycle (all via direct DB ops — no TriggerService dependency to
 * avoid a circular import with TriggerService → WorkflowService):
 *   - create(): Provisions exactly one trigger for every new workflow.
 *     Defaults to manual kind when no trigger input is provided.
 *   - update(): Updates the associated trigger when trigger input is provided.
 *     Kind changes are handled by deleting and re-inserting the trigger row.
 *   - delete(): Deletes the workflow AND its trigger to avoid orphans.
 *     Note: because we manage it here directly (not via TriggerService) we
 *     cannot automatically call TriggerService.unscheduleCron(). That is
 *     acceptable — on the next server restart TriggerService.loadAll() will
 *     skip any row that no longer exists, and the deleted trigger will never
 *     show up. If you need instant cron unscheduling on delete, wire the
 *     unscheduleCron call into the route handler instead.
 *   - getById/listByAgent(): Joins against agent_triggers to attach trigger.
 */
export class WorkflowService {
	/**
	 * Create a new workflow for an agent, provisioning a trigger at the same time.
	 * Validates the input via the workflow Zod schema before inserting.
	 */
	async create(input: {
		agentId: string;
		ownerId: string;
		name: string;
		description?: string;
		steps: WorkflowStep[];
		isEnabled?: boolean;
		trigger?: WorkflowTriggerInput;
	}): Promise<Workflow> {
		// Validate workflow input through Zod — throws ZodError on invalid data
		const validated = validateWorkflowCreate({
			name: input.name,
			description: input.description,
			steps: input.steps,
			isEnabled: input.isEnabled,
		});

		const now = new Date();
		const [workflowRow] = await db
			.insert(workflows)
			.values({
				agentId: input.agentId,
				ownerId: input.ownerId,
				name: validated.name,
				description: validated.description ?? null,
				steps: validated.steps as WorkflowStep[],
				isEnabled: validated.isEnabled,
				createdAt: now,
				updatedAt: now,
			})
			.returning();

		// Provision trigger — default to manual if not specified
		const triggerInput = input.trigger ?? {};
		const kind: AgentTriggerKind = triggerInput.kind ?? 'manual';
		const config = buildTriggerConfig(kind, triggerInput.config);
		const triggerName = triggerInput.name ?? validated.name;

		const [triggerRow] = await db
			.insert(agentTriggers)
			.values({
				agentId: input.agentId,
				ownerId: input.ownerId,
				kind,
				name: triggerName,
				config,
				isEnabled: true,
				description: triggerInput.description ?? null,
				workflowId: workflowRow.id,
				createdAt: now,
				updatedAt: now,
			})
			.returning();

		return rowToWorkflow(workflowRow, rowToTrigger(triggerRow));
	}

	/**
	 * List all workflows for a given agent, verifying agent ownership.
	 * Attaches trigger data to each workflow.
	 */
	async listByAgent(agentId: string, ownerId: string): Promise<Workflow[]> {
		// Verify the agent belongs to this owner first
		const agentRows = await db
			.select({ id: agents.id })
			.from(agents)
			.where(and(eq(agents.id, agentId), eq(agents.ownerId, ownerId)))
			.limit(1);
		if (!agentRows[0]) return [];

		const rows = await db
			.select()
			.from(workflows)
			.where(and(eq(workflows.agentId, agentId), eq(workflows.ownerId, ownerId)));

		if (rows.length === 0) return [];

		// Fetch all triggers for this agent in a single query, then map by workflowId
		const triggerRows = await db
			.select()
			.from(agentTriggers)
			.where(and(eq(agentTriggers.agentId, agentId), eq(agentTriggers.ownerId, ownerId)));

		const workflowIds = new Set(rows.map((r) => r.id));
		const triggerMap = new Map<string, AgentTrigger>();
		for (const t of triggerRows) {
			if (t.workflowId && workflowIds.has(t.workflowId) && !triggerMap.has(t.workflowId)) {
				triggerMap.set(t.workflowId, rowToTrigger(t));
			}
		}

		return rows.map((row) => rowToWorkflow(row, triggerMap.get(row.id)));
	}

	/**
	 * List all workflows belonging to an owner across all agents, newest first.
	 * Optionally filtered to a single agent. Attaches trigger data to each workflow.
	 * Used by the top-level workflows page.
	 */
	async listByOwner(ownerId: string, agentId?: string): Promise<Workflow[]> {
		const conditions = [eq(workflows.ownerId, ownerId)];
		if (agentId) conditions.push(eq(workflows.agentId, agentId));

		const rows = await db
			.select()
			.from(workflows)
			.where(and(...conditions))
			.orderBy(desc(workflows.updatedAt));

		if (rows.length === 0) return [];

		const workflowIds = rows.map((r) => r.id);
		const triggerRows = await db
			.select()
			.from(agentTriggers)
			.where(
				and(eq(agentTriggers.ownerId, ownerId), inArray(agentTriggers.workflowId, workflowIds)),
			);

		const triggerMap = new Map<string, AgentTrigger>();
		for (const t of triggerRows) {
			if (t.workflowId && !triggerMap.has(t.workflowId)) {
				triggerMap.set(t.workflowId, rowToTrigger(t));
			}
		}

		return rows.map((row) => rowToWorkflow(row, triggerMap.get(row.id)));
	}

	/**
	 * Get a single workflow by ID, enforcing ownership.
	 * Attaches trigger data.
	 */
	async getById(id: string, ownerId: string): Promise<Workflow | null> {
		const rows = await db
			.select()
			.from(workflows)
			.where(and(eq(workflows.id, id), eq(workflows.ownerId, ownerId)))
			.limit(1);
		if (!rows[0]) return null;

		const triggerRows = await db
			.select()
			.from(agentTriggers)
			.where(eq(agentTriggers.workflowId, id))
			.limit(1);

		const trigger = triggerRows[0] ? rowToTrigger(triggerRows[0]) : undefined;
		return rowToWorkflow(rows[0], trigger);
	}

	/**
	 * Get a workflow by ID without ownership check — used internally by the
	 * trigger system which already verifies ownership via the trigger row.
	 * Attaches trigger data.
	 */
	async getByIdInternal(id: string): Promise<Workflow | null> {
		const rows = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
		if (!rows[0]) return null;

		const triggerRows = await db
			.select()
			.from(agentTriggers)
			.where(eq(agentTriggers.workflowId, id))
			.limit(1);

		const trigger = triggerRows[0] ? rowToTrigger(triggerRows[0]) : undefined;
		return rowToWorkflow(rows[0], trigger);
	}

	/**
	 * List all workflows for an agent by agentId only (no ownerId check).
	 * Used by agent sandbox endpoints which already authenticate via PROXY_TOKEN.
	 * Attaches trigger data.
	 */
	async listByAgentInternal(agentId: string): Promise<Workflow[]> {
		const rows = await db.select().from(workflows).where(eq(workflows.agentId, agentId));
		if (rows.length === 0) return [];

		const workflowIds = new Set(rows.map((r) => r.id));
		const triggerRows = await db
			.select()
			.from(agentTriggers)
			.where(eq(agentTriggers.agentId, agentId));

		const triggerMap = new Map<string, AgentTrigger>();
		for (const t of triggerRows) {
			if (t.workflowId && workflowIds.has(t.workflowId) && !triggerMap.has(t.workflowId)) {
				triggerMap.set(t.workflowId, rowToTrigger(t));
			}
		}

		return rows.map((row) => rowToWorkflow(row, triggerMap.get(row.id)));
	}

	/**
	 * Update an existing workflow. Only provided fields are updated.
	 * Steps array (if provided) is fully replaced and re-validated.
	 * If trigger input is provided, updates the associated trigger's config/name/kind.
	 * Kind changes are handled by deleting and re-inserting the trigger row.
	 */
	async update(
		id: string,
		ownerId: string,
		input: {
			name?: string;
			description?: string;
			steps?: WorkflowStep[];
			isEnabled?: boolean;
			trigger?: WorkflowTriggerInput;
		},
	): Promise<Workflow | null> {
		const existing = await this.getById(id, ownerId);
		if (!existing) return null;

		// Validate the update payload
		const validated = validateWorkflowUpdate(input);

		const workflowUpdates: Partial<{
			name: string;
			description: string | null;
			steps: WorkflowStep[];
			isEnabled: boolean;
			updatedAt: Date;
		}> = { updatedAt: new Date() };

		if (validated.name !== undefined) workflowUpdates.name = validated.name;
		if (validated.description !== undefined)
			workflowUpdates.description = validated.description ?? null;
		if (validated.steps !== undefined) workflowUpdates.steps = validated.steps as WorkflowStep[];
		if (validated.isEnabled !== undefined) workflowUpdates.isEnabled = validated.isEnabled;

		await db
			.update(workflows)
			.set(workflowUpdates)
			.where(and(eq(workflows.id, id), eq(workflows.ownerId, ownerId)));

		// Update trigger if input provided
		if (input.trigger !== undefined) {
			const triggerInput = input.trigger;

			if (existing.trigger) {
				const newKind = triggerInput.kind ?? existing.trigger.kind;

				if (triggerInput.kind && triggerInput.kind !== existing.trigger.kind) {
					// Kind changed — delete old trigger row and insert a new one
					await db
						.delete(agentTriggers)
						.where(
							and(eq(agentTriggers.id, existing.trigger.id), eq(agentTriggers.ownerId, ownerId)),
						);

					const now = new Date();
					await db.insert(agentTriggers).values({
						agentId: existing.agentId,
						ownerId,
						kind: newKind,
						name: triggerInput.name ?? existing.trigger.name,
						config: buildTriggerConfig(newKind, triggerInput.config),
						isEnabled: existing.trigger.isEnabled,
						description: triggerInput.description ?? existing.trigger.description ?? null,
						workflowId: id,
						createdAt: now,
						updatedAt: now,
					});
				} else {
					// Same kind — patch the existing row
					const triggerUpdates: Partial<{
						name: string;
						config: AgentTriggerConfig;
						description: string | null;
						updatedAt: Date;
					}> = { updatedAt: new Date() };

					if (triggerInput.name !== undefined) triggerUpdates.name = triggerInput.name;
					if (triggerInput.config !== undefined)
						// Pass the stored config so the webhook secret is preserved across updates
						triggerUpdates.config = buildTriggerConfig(
							existing.trigger.kind,
							triggerInput.config,
							existing.trigger.config,
						);
					if (triggerInput.description !== undefined)
						triggerUpdates.description = triggerInput.description ?? null;

					await db
						.update(agentTriggers)
						.set(triggerUpdates)
						.where(
							and(eq(agentTriggers.id, existing.trigger.id), eq(agentTriggers.ownerId, ownerId)),
						);
				}
			} else {
				// Edge case: workflow has no trigger yet (created before this feature was added).
				// Provision one now.
				const kind: AgentTriggerKind = triggerInput.kind ?? 'manual';
				const effectiveName = triggerInput.name ?? validated.name ?? existing.name;
				const now = new Date();
				await db.insert(agentTriggers).values({
					agentId: existing.agentId,
					ownerId,
					kind,
					name: effectiveName,
					config: buildTriggerConfig(kind, triggerInput.config),
					isEnabled: true,
					description: triggerInput.description ?? null,
					workflowId: id,
					createdAt: now,
					updatedAt: now,
				});
			}
		}

		return this.getById(id, ownerId);
	}

	/**
	 * Delete a workflow by ID, enforcing ownership.
	 * Also deletes the associated trigger to avoid orphaned trigger rows.
	 * Note: if the trigger was a cron, its node-cron task will be cleaned up
	 * on the next call that touches TriggerService (e.g. loadAll on restart)
	 * since the row no longer exists. For immediate unscheduling, call
	 * TriggerService.delete() from the route handler before this method.
	 */
	async delete(id: string, ownerId: string): Promise<boolean> {
		// Delete the trigger pointing at this workflow first
		await db
			.delete(agentTriggers)
			.where(and(eq(agentTriggers.workflowId, id), eq(agentTriggers.ownerId, ownerId)));

		const result = await db
			.delete(workflows)
			.where(and(eq(workflows.id, id), eq(workflows.ownerId, ownerId)));
		return (result.rowCount ?? 0) > 0;
	}
}

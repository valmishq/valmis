import { rmSync } from 'fs';
import { resolve, join } from 'path';
import type {
	AgentTriggerType,
	AgentRuntimeConfig,
	Agent,
	CredentialMeta,
	SkillRuntimeEntry,
	Workflow,
	WorkflowTriggerContext,
} from '@repo/types';
import { getCredentialDefinition } from '@repo/utils';
import { AgentSessionService } from './AgentSessionService.js';
import { AgentProxyService } from './AgentProxyService.js';
import { AgentService } from './AgentService.js';
import { LlmProviderService } from './LlmProviderService.js';
import { CredentialService } from './CredentialService.js';
import { SkillMaterializerService } from './SkillMaterializerService.js';
import { agentStreamBus } from './AgentStreamBus.js';
import { logger } from '../config/logger.js';
import type { ExecutionDriver, RuntimeHandle } from './runtime/ExecutionDriver.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract a clean, user-facing error message from child process output.
 *
 * The child uses pino logger which emits newline-delimited JSON to stdout.
 * Each line is a JSON object like:
 *   {"level":50,"msg":"[agent-runtime] fatal error","err":{"message":"..."}}
 *
 * Strategy (in order):
 *   1. Walk lines in reverse; parse as JSON and look for err.message in level≥40 entries.
 *   2. Fall back to regex matching "Error: <message>" on plain-text lines (stderr).
 *   3. Return the last non-empty line trimmed to 300 chars.
 *   4. Generic fallback if output is empty.
 */
function extractUserErrorMessage(output: string): string {
	if (!output.trim()) {
		return 'Agent process exited with an error. Please try again.';
	}

	const lines = output.split('\n').filter((l) => l.trim().length > 0);

	// Walk backwards so we get the most recent error first
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim();

		// Try pino structured JSON first
		if (line.startsWith('{')) {
			try {
				const entry = JSON.parse(line) as {
					level?: number;
					msg?: string;
					err?: { message?: string };
				};
				// pino level 40=warn, 50=error — only surface errors/warns
				if (entry.level !== undefined && entry.level >= 40) {
					if (entry.err?.message) {
						return entry.err.message.slice(0, 300);
					}
					if (entry.msg && !entry.msg.startsWith('[')) {
						// Only use msg if it looks like a real error message, not a log prefix
						return entry.msg.slice(0, 300);
					}
				}
			} catch {
				// not valid JSON — fall through to regex
			}
		}

		// Plain-text "Error: <message>" lines (from stderr / uncaught exceptions)
		const match = line.match(/(?:^|:\s*)Error:\s*(.+)/i);
		if (match) {
			return match[1].slice(0, 300);
		}
	}

	// Last resort: return the last non-empty line
	const lastLine = lines[lines.length - 1].trim();
	return lastLine.slice(0, 300) || 'Agent process exited with an error. Please try again.';
}

// ─── Optional workflow config passed to spawnForThread ───────────────────────

/** Workflow config injected into the sandbox for workflow runs */
export interface WorkflowSpawnConfig {
	runId: string;
	definition: Workflow;
	triggerContext: WorkflowTriggerContext;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Manages agent execution by spawning one isolated execution unit per turn
 * through a pluggable ExecutionDriver:
 *
 *   - ProcessDriver — plain Node.js child process (bare-metal dev default).
 *     Code-level isolation only: sanitized env, no OS boundary.
 *   - DockerDriver  — hardened sibling Docker container (production default
 *     in docker-compose). OS-level isolation: namespaces, read-only rootfs,
 *     non-root user, resource limits, per-agent network egress policy.
 *
 * Driver-independent security model:
 *   - The runtime receives only: AGENT_ID, THREAD_ID, PROXY_TOKEN, PROXY_HOST,
 *     RUNTIME_CONFIG, WORKSPACE_ROOT.
 *   - DATABASE_URL, CREDENTIAL_ENCRYPTION_KEY, JWT_SECRET, and all other backend
 *     secrets are never passed to the runtime.
 *   - Credentials and LLM keys are never passed to the runtime — all sensitive
 *     operations are proxied through the PROXY_TOKEN-authenticated
 *     /v1/runtime/internal/* endpoints.
 *   - The PROXY_TOKEN is a 15-min scoped JWT authorising only the agent's
 *     credential list.
 *
 * Workflow execution:
 *   When workflowConfig is provided, the RUNTIME_CONFIG includes a `workflow` field
 *   containing the full workflow definition and trigger context. The runtime
 *   routes to workflow-runner.ts instead of agent-runner.ts.
 *
 * Lifecycle:
 *   - spawnForThread() is non-blocking: it spawns the runtime and returns.
 *   - The runtime exits with code 0 on success, 1 on error.
 *   - Thread status is updated to 'running' before spawn and to 'completed'/'error' on exit.
 *   - A hard timeout (AGENT_RUNTIME_TIMEOUT_MS, default 40 min) kills runaway runs.
 *   - A global concurrency cap (AGENT_RUNTIME_MAX_CONCURRENT, default 20) bounds
 *     simultaneous runs.
 */
export class AgentRuntimeService {
	/**
	 * Base directory for per-agent persistent workspaces, as seen by the backend.
	 * Each agent gets its own subdirectory: <workspacesBasePath>/<agentId>/
	 * Override with AGENT_WORKSPACES_PATH env var.
	 */
	private readonly workspacesBasePath: string;

	/** Hard wall-clock limit per run. Default 40 min — must exceed the 35-min HITL long-poll. */
	private readonly runTimeoutMs: number;

	/** Maximum simultaneous runs across all agents/owners */
	private readonly maxConcurrent: number;

	/** Live runtime handles, for the concurrency cap and shutdown() */
	private readonly liveHandles = new Set<RuntimeHandle>();

	constructor(
		private readonly driver: ExecutionDriver,
		private readonly sessionService: AgentSessionService,
		private readonly proxyService: AgentProxyService,
		private readonly agentService: AgentService,
		private readonly llmProviderService: LlmProviderService,
		private readonly credentialService: CredentialService,
		private readonly skillMaterializer: SkillMaterializerService,
	) {
		// Workspaces base: repo root sibling directory by default.
		// process.cwd() is apps/backend/ so we go up two levels to reach the monorepo root.
		this.workspacesBasePath =
			process.env.AGENT_WORKSPACES_PATH ?? resolve(process.cwd(), '../../.agent-workspaces');
		this.runTimeoutMs = parseInt(process.env.AGENT_RUNTIME_TIMEOUT_MS ?? '2400000', 10);
		this.maxConcurrent = parseInt(process.env.AGENT_RUNTIME_MAX_CONCURRENT ?? '20', 10);
	}

	/** Validate driver configuration and reap orphaned runs. Call once at backend startup. */
	async init(): Promise<void> {
		await this.driver.init();
	}

	/** Kill all live runs. Call on backend shutdown (SIGTERM/SIGINT). */
	async shutdown(): Promise<void> {
		logger.info({ liveRuns: this.liveHandles.size }, '[runtime] shutting down live agent runs');
		await this.driver.shutdown();
		this.liveHandles.clear();
	}

	/**
	 * Spawn one isolated runtime to execute one agent turn.
	 *
	 * Called when:
	 *   1. A user sends a chat message (triggerType = 'chat')
	 *   2. A cron trigger fires (triggerType = 'cron')
	 *   3. A webhook trigger fires (triggerType = 'webhook')
	 *   4. A manual trigger fires (triggerType = 'manual')
	 *
	 * When workflowConfig is provided, the runtime config includes the full workflow
	 * definition and trigger context. The runtime routes to workflow-runner.ts.
	 *
	 * The method is non-blocking — it spawns the runtime and returns immediately.
	 */
	async spawnForThread(
		agentId: string,
		threadId: string,
		ownerId: string,
		triggerType: AgentTriggerType = 'chat',
		triggerPayload?: Record<string, unknown>,
		userDatetime?: string,
		workflowConfig?: WorkflowSpawnConfig,
	): Promise<void> {
		// Concurrency cap — reject before touching thread state or spawning.
		if (this.liveHandles.size >= this.maxConcurrent) {
			logger.warn(
				{ agentId, threadId, liveRuns: this.liveHandles.size, max: this.maxConcurrent },
				'[runtime] concurrency cap reached — rejecting spawn',
			);
			await this.sessionService.updateThreadStatus(threadId, 'error');
			agentStreamBus.emit(threadId, {
				type: 'error',
				message: 'Too many agent runs are in progress. Please try again shortly.',
			});
			agentStreamBus.emit(threadId, { type: 'done' });
			return;
		}

		// Fetch the agent once — reuse for both the proxy token and runtime config build.
		const agent = await this.agentService.getById(agentId, ownerId);
		if (!agent) {
			throw new Error(`Agent not found: ${agentId}`);
		}

		// Ensure the per-agent workspace exists (driver also fixes ownership for
		// the runtime user where needed). Prepared before the config build so the
		// skill materializer can write into it.
		const workspacePath = join(this.workspacesBasePath, agentId);
		if (!workspacePath.startsWith(this.workspacesBasePath)) {
			throw new Error(`Invalid agentId — workspace path escapes base: ${agentId}`);
		}
		this.driver.prepareWorkspace(workspacePath);

		// Materialize assigned skills into <workspace>/skills/ (rewritten fresh
		// every spawn) and get the compact index for the system prompt.
		const skills = await this.skillMaterializer.materializeForAgent(agentId, workspacePath);

		// Build the runtime config (no secrets) for the runtime.
		const runtimeConfig = await this.buildRuntimeConfig(
			agent,
			threadId,
			ownerId,
			triggerType,
			skills,
			triggerPayload,
			userDatetime,
			workflowConfig,
		);

		// Issue a scoped PROXY_TOKEN for this runtime session
		const proxyToken = await this.proxyService.issueProxyToken({
			agentId,
			ownerId,
			threadId,
			credentialIds: agent.credentialIds,
		});

		// Mark thread as running before spawning
		await this.sessionService.updateThreadStatus(threadId, 'running');

		// Sanitized environment — no backend secrets. PROXY_HOST and
		// WORKSPACE_ROOT are injected by the driver.
		const env: Record<string, string> = {
			NODE_ENV: process.env.NODE_ENV ?? 'development',
			AGENT_ID: agentId,
			THREAD_ID: threadId,
			PROXY_TOKEN: proxyToken,
			RUNTIME_CONFIG: JSON.stringify(runtimeConfig),
		};

		logger.info(
			{
				agentId,
				threadId,
				triggerType,
				driver: this.driver.name,
				workspacePath,
				allowInternetAccess: agent.allowInternetAccess,
				hasWorkflow: !!workflowConfig,
			},
			'[runtime] spawning agent runtime',
		);

		let handle: RuntimeHandle;
		try {
			handle = await this.driver.spawn({
				agentId,
				threadId,
				allowInternetAccess: agent.allowInternetAccess,
				workspacePath,
				env,
			});
		} catch (spawnErr) {
			logger.error({ err: spawnErr, agentId, threadId }, '[runtime] failed to spawn runtime');
			await this.sessionService.updateThreadStatus(threadId, 'error');
			agentStreamBus.emit(threadId, {
				type: 'error',
				message: `Failed to start agent runtime: ${spawnErr instanceof Error ? spawnErr.message : String(spawnErr)}`,
			});
			agentStreamBus.emit(threadId, { type: 'done' });
			return;
		}
		this.liveHandles.add(handle);

		logger.debug({ agentId, threadId, runtimeId: handle.id }, '[runtime] runtime started');

		// Accumulate the last N chars of both stdout and stderr.
		// The runtime uses pino logger which writes structured JSON to stdout, not stderr.
		// We capture both streams so extractUserErrorMessage can find the actual error
		// regardless of which stream it appears on.
		const OUTPUT_CAP = 4096;
		let stdoutTail = '';
		let stderrTail = '';

		handle.onStdout((text) => {
			logger.info({ agentId, threadId }, `[agent] ${text.trim()}`);
			stdoutTail = (stdoutTail + text).slice(-OUTPUT_CAP);
		});
		handle.onStderr((text) => {
			logger.warn({ agentId, threadId }, `[agent:stderr] ${text.trim()}`);
			stderrTail = (stderrTail + text).slice(-OUTPUT_CAP);
		});

		// Hard timeout — kills runs that hang past the HITL window or loop forever.
		// The PROXY_TOKEN expires after 15 min, but an idle/looping runtime would
		// otherwise keep its slot (and container) alive indefinitely.
		let timedOut = false;
		const timeoutTimer = setTimeout(() => {
			timedOut = true;
			logger.warn(
				{ agentId, threadId, runtimeId: handle.id, timeoutMs: this.runTimeoutMs },
				'[runtime] run timed out — killing runtime',
			);
			void handle.kill();
		}, this.runTimeoutMs);
		timeoutTimer.unref();

		handle.onClose(async (code) => {
			clearTimeout(timeoutTimer);
			this.liveHandles.delete(handle);
			const status = code === 0 ? 'completed' : 'error';
			logger.info({ agentId, threadId, code, status }, '[runtime] agent runtime exited');
			try {
				await this.sessionService.updateThreadStatus(threadId, status);
			} catch (err) {
				logger.error({ err, threadId }, '[runtime] failed to update thread status on exit');
			}

			if (code !== 0) {
				if (timedOut) {
					agentStreamBus.emit(threadId, {
						type: 'error',
						message: `Agent run timed out after ${Math.round(this.runTimeoutMs / 60000)} minutes.`,
					});
				} else {
					// Try stderr first (raw Node errors), then fall back to stdout (pino JSON logs).
					const combinedOutput = stderrTail || stdoutTail;
					agentStreamBus.emit(threadId, {
						type: 'error',
						message: extractUserErrorMessage(combinedOutput),
					});
				}
			}
			// Always emit 'done' so the SSE subscriber can clean up
			agentStreamBus.emit(threadId, { type: 'done' });
		});

		handle.onError((err) => {
			logger.error({ err, agentId, threadId, runtimeId: handle.id }, '[runtime] runtime error');
		});
	}

	/**
	 * Remove the persistent workspace directory for an agent.
	 * Called by AgentService.delete() when an agent is permanently deleted.
	 */
	removeWorkspace(agentId: string): void {
		const workspacePath = join(this.workspacesBasePath, agentId);
		if (!workspacePath.startsWith(this.workspacesBasePath)) {
			logger.warn({ agentId }, '[runtime] removeWorkspace: invalid agentId skipped');
			return;
		}
		try {
			rmSync(workspacePath, { recursive: true, force: true });
			logger.info({ agentId }, '[runtime] removed agent workspace');
		} catch (err) {
			logger.error({ err, agentId }, '[runtime] failed to remove agent workspace');
		}
	}

	/**
	 * Build the AgentRuntimeConfig that is passed to the runtime via env var.
	 * Contains no secrets — API keys and credentials stay in the backend process.
	 *
	 * The agent object is passed in from spawnForThread to avoid a redundant DB fetch.
	 * When workflowConfig is provided, the `workflow` field is included so the runtime
	 * routes to workflow-runner.ts.
	 */
	private async buildRuntimeConfig(
		agent: Agent,
		threadId: string,
		ownerId: string,
		triggerType: AgentTriggerType,
		skills: SkillRuntimeEntry[],
		triggerPayload?: Record<string, unknown>,
		userDatetime?: string,
		workflowConfig?: WorkflowSpawnConfig,
	): Promise<AgentRuntimeConfig> {
		let modelProvider = '';
		let modelId = '';

		if (agent.modelConfigId) {
			const config = await this.llmProviderService.getById(agent.modelConfigId, ownerId);
			if (config) {
				modelProvider = config.provider;
				modelId = config.model;
			}
		}

		// Resolve credential metadata so the agent prompt can show name, integration,
		// and OAuth2 scopes (when available). We fetch all credentials for this owner
		// and filter to those on the agent.
		//
		// Scope resolution strategy (in priority order):
		//   1. The "scope" property stored in the credential's encrypted data — this is
		//      the value the user actually entered (e.g. Google Workspace lets users
		//      customise the scopes). It lives in the decrypted data blob as `data.scope`.
		//   2. The default scope declared in the definition's oauth2.scope field.
		//   3. undefined — no scope info available; agent may attempt the call freely.
		const credentials: CredentialMeta[] = [];
		if (agent.credentialIds.length > 0) {
			const allCredentials = await this.credentialService.listByOwner(ownerId);
			for (const cred of allCredentials) {
				if (agent.credentialIds.includes(cred.id)) {
					// Decrypt once — reused for both scope resolution and non-secret property extraction
					let data: Record<string, unknown> | null = null;
					try {
						data = await this.credentialService.getDecryptedData(cred.id, ownerId);
					} catch (err) {
						logger.warn(
							{ credId: cred.id, err },
							'[runtime] failed to decrypt credential data for runtime config',
						);
					}

					let scopes: string | undefined;
					try {
						// First: read the actual stored value from the encrypted data blob.
						if (data && typeof data.scope === 'string' && data.scope.trim().length > 0) {
							scopes = data.scope.trim();
						} else {
							// Fallback: use the default scope from the YAML definition (oauth2.scope).
							const definition = getCredentialDefinition(cred.type);
							const defScope = definition?.oauth2?.scope;
							if (typeof defScope === 'string' && defScope.trim().length > 0) {
								scopes = defScope.trim();
							}
						}
					} catch (err) {
						// Non-fatal — agent will operate without scope info for this credential.
						logger.warn(
							{ credId: cred.id, err },
							'[runtime] failed to resolve scopes for credential — omitting from prompt',
						);
					}

					// Collect non-secret properties (string/number/boolean typed fields).
					// These give the agent context it needs to construct URLs (e.g. baseUrl for
					// Home Assistant). Secret-typed fields are never included.
					let properties: Record<string, string> | undefined;
					try {
						const definition = getCredentialDefinition(cred.type);
						if (definition && data) {
							const nonSecretProps: Record<string, string> = {};
							for (const prop of definition.properties) {
								if (prop.type !== 'secret' && data[prop.name] !== undefined) {
									nonSecretProps[prop.name] = String(data[prop.name]);
								}
							}
							if (Object.keys(nonSecretProps).length > 0) {
								properties = nonSecretProps;
							}
						}
					} catch (propErr) {
						logger.warn(
							{ credId: cred.id, err: propErr },
							'[runtime] failed to resolve non-secret properties for credential',
						);
					}

					credentials.push({
						id: cred.id,
						name: cred.name,
						integration: cred.type,
						...(scopes !== undefined ? { scopes } : {}),
						...(properties !== undefined ? { properties } : {}),
					});
				}
			}
		}

		return {
			agentId: agent.id,
			ownerId,
			threadId,
			name: agent.name,
			systemInstruction: agent.systemInstruction ?? '',
			modelProvider,
			modelId,
			credentialIds: agent.credentialIds,
			credentials,
			// Compact skill index only — full instructions are materialized into
			// <workspace>/skills/ and read by the agent on demand.
			...(skills.length > 0 ? { skills } : {}),
			embeddingModelConfigId: agent.embeddingModelConfigId,
			triggerType,
			triggerPayload,
			// User's local datetime — used to inject current date/time context into the system prompt.
			// Falls back to server time in agent-runner.ts when absent (cron/webhook/manual triggers).
			...(userDatetime !== undefined ? { userDatetime } : {}),
			// Workflow config — present only for workflow runs. Causes the runtime to route
			// to workflow-runner.ts rather than agent-runner.ts.
			...(workflowConfig !== undefined
				? {
						workflow: {
							runId: workflowConfig.runId,
							definition: workflowConfig.definition,
							triggerContext: workflowConfig.triggerContext,
						},
					}
				: {}),
		};
	}
}

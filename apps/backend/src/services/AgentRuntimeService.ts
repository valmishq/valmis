import { spawn } from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import type { AgentTriggerType, AgentRuntimeConfig, Agent, CredentialMeta } from '@repo/types';
import { getCredentialDefinition } from '@repo/utils';
import { AgentSessionService } from './AgentSessionService.js';
import { AgentProxyService } from './AgentProxyService.js';
import { AgentService } from './AgentService.js';
import { LlmProviderService } from './llmProviderService.js';
import { CredentialService } from './CredentialService.js';
import { agentStreamBus } from './AgentStreamBus.js';
import { logger } from '../config/logger.js';

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

/**
 * Manages agent execution by spawning a dedicated Node.js child process per turn.
 *
 * Security model (code-level isolation, no Docker required):
 *   - The child process receives only: AGENT_ID, THREAD_ID, PROXY_TOKEN, PROXY_HOST,
 *     RUNTIME_CONFIG, WORKSPACE_ROOT.
 *   - DATABASE_URL, CREDENTIAL_ENCRYPTION_KEY, JWT_SECRET, and all other backend secrets
 *     are explicitly excluded from the child's environment.
 *   - Credentials and LLM keys are never passed to the child — all sensitive operations
 *     are proxied through the PROXY_TOKEN-authenticated /v1/runtime/internal/* endpoints.
 *   - The PROXY_TOKEN is a 15-min scoped JWT authorising only the agent's credential list.
 *   - File access is restricted to WORKSPACE_ROOT (<AGENT_WORKSPACES_PATH>/<agentId>/)
 *     by the resolveWorkspacePath() guard inside agent-runner.ts.
 *
 * Process lifecycle:
 *   - spawnForThread() is non-blocking: it spawns the child and returns immediately.
 *   - The child exits with code 0 on success, 1 on error.
 *   - Thread status is updated to 'running' before spawn and to 'completed'/'error' on exit.
 *   - On non-zero exit an 'error' SSE event is emitted so the browser can unlock the UI.
 */
export class AgentRuntimeService {
	/**
	 * Absolute path to the compiled agent-runtime entrypoint on the local filesystem.
	 * Default: apps/agent-runtime/dist/index.js (resolved relative to the repo root).
	 * Override with AGENT_RUNTIME_ENTRY env var for custom builds or production deploys.
	 */
	private readonly agentRuntimeEntry: string;

	/**
	 * Base directory for per-agent persistent workspaces.
	 * Each agent gets its own subdirectory: <workspacesBasePath>/<agentId>/
	 * This directory is passed to the child as WORKSPACE_ROOT and used as the
	 * base for all file tool operations inside agent-runner.ts.
	 * Override with AGENT_WORKSPACES_PATH env var.
	 */
	private readonly workspacesBasePath: string;

	/** Backend port — used to build the PROXY_HOST URL for the child process */
	private readonly backendPort: string;

	constructor(
		private readonly sessionService: AgentSessionService,
		private readonly proxyService: AgentProxyService,
		private readonly agentService: AgentService,
		private readonly llmProviderService: LlmProviderService,
		private readonly credentialService: CredentialService,
	) {
		// Resolve agent-runtime entry relative to the repo root by default.
		// process.cwd() is apps/backend/ so we go up two levels to reach the monorepo root.
		// In production override with AGENT_RUNTIME_ENTRY env var.
		this.agentRuntimeEntry =
			process.env.AGENT_RUNTIME_ENTRY ??
			resolve(process.cwd(), '../../apps/agent-runtime/dist/index.js');

		// Workspaces base: repo root sibling directory by default (same reasoning).
		this.workspacesBasePath =
			process.env.AGENT_WORKSPACES_PATH ?? resolve(process.cwd(), '../../.agent-workspaces');

		this.backendPort = process.env.BACKEND_PORT ?? '4000';
	}

	/**
	 * Spawn a Node.js child process to execute one agent turn.
	 *
	 * Called when:
	 *   1. A user sends a chat message (triggerType = 'chat')
	 *   2. A cron trigger fires (triggerType = 'cron')
	 *   3. A webhook trigger fires (triggerType = 'webhook')
	 *   4. A manual trigger fires (triggerType = 'manual')
	 *
	 * The method is non-blocking — it spawns the child and returns immediately.
	 */
	async spawnForThread(
		agentId: string,
		threadId: string,
		ownerId: string,
		triggerType: AgentTriggerType = 'chat',
		triggerPayload?: Record<string, unknown>,
		userDatetime?: string,
	): Promise<void> {
		// Fetch the agent once — reuse for both the proxy token and runtime config build.
		const agent = await this.agentService.getById(agentId, ownerId);
		if (!agent) {
			throw new Error(`Agent not found: ${agentId}`);
		}

		// Build the runtime config (no secrets) for the child process.
		// Agent is passed in directly to avoid a second DB round-trip.
		const runtimeConfig = await this.buildRuntimeConfig(
			agent,
			threadId,
			ownerId,
			triggerType,
			triggerPayload,
			userDatetime,
		);

		// Issue a scoped PROXY_TOKEN for this child process session
		const proxyToken = await this.proxyService.issueProxyToken({
			agentId,
			ownerId,
			threadId,
			credentialIds: agent.credentialIds,
		});

		// Mark thread as running before spawning
		await this.sessionService.updateThreadStatus(threadId, 'running');

		// Ensure per-agent workspace directory exists.
		// Use path.join to safely construct the path and guard against non-UUID agent IDs.
		const workspacePath = join(this.workspacesBasePath, agentId);
		if (!workspacePath.startsWith(this.workspacesBasePath)) {
			throw new Error(`Invalid agentId — workspace path escapes base: ${agentId}`);
		}
		mkdirSync(workspacePath, { recursive: true });

		// The child connects to the backend on localhost — no Docker networking needed
		const proxyHostUrl = `http://localhost:${this.backendPort}`;

		// Build a sanitised environment for the child:
		// Strip all backend secrets and pass only what the agent runtime needs.
		const childEnv: Record<string, string> = {
			// Inherit PATH and Node.js internals so `node` can resolve modules
			PATH: process.env.PATH ?? '',
			HOME: process.env.HOME ?? '',
			NODE_ENV: process.env.NODE_ENV ?? 'development',
			// Agent context — no secrets
			AGENT_ID: agentId,
			THREAD_ID: threadId,
			PROXY_TOKEN: proxyToken,
			PROXY_HOST: proxyHostUrl,
			RUNTIME_CONFIG: JSON.stringify(runtimeConfig),
			// Workspace root for this agent's persistent file storage
			WORKSPACE_ROOT: workspacePath,
		};

		logger.info(
			{ agentId, threadId, triggerType, entry: this.agentRuntimeEntry, workspacePath },
			'[runtime] spawning agent process',
		);

		const child = spawn('node', [this.agentRuntimeEntry], {
			env: childEnv,
			stdio: ['ignore', 'pipe', 'pipe'],
			detached: false,
		});

		logger.debug({ agentId, threadId, pid: child.pid }, '[runtime] child process started');

		// Accumulate the last N chars of both stdout and stderr.
		// The child process uses pino logger which writes structured JSON to stdout, not stderr.
		// We capture both streams so extractUserErrorMessage can find the actual error regardless
		// of which stream it appears on.
		const OUTPUT_CAP = 4096;
		let stdoutTail = '';
		let stderrTail = '';

		// Stream child stdout/stderr to logger and keep rolling tails for error extraction
		child.stdout?.on('data', (data: Buffer) => {
			const text = data.toString();
			logger.info({ agentId, threadId }, `[agent] ${text.trim()}`);
			stdoutTail = (stdoutTail + text).slice(-OUTPUT_CAP);
		});
		child.stderr?.on('data', (data: Buffer) => {
			const text = data.toString();
			logger.warn({ agentId, threadId }, `[agent:stderr] ${text.trim()}`);
			stderrTail = (stderrTail + text).slice(-OUTPUT_CAP);
		});

		// Update thread status based on exit code.
		// On non-zero exit also emit an SSE error event so the browser can unlock the UI
		// and see what went wrong (without this the isStreaming flag stays true indefinitely).
		child.on('close', async (code) => {
			const status = code === 0 ? 'completed' : 'error';
			logger.info({ agentId, threadId, code, status }, '[runtime] agent process exited');
			try {
				await this.sessionService.updateThreadStatus(threadId, status);
			} catch (err) {
				logger.error({ err, threadId }, '[runtime] failed to update thread status on exit');
			}

			if (code !== 0) {
				// Try stderr first (raw Node errors), then fall back to stdout (pino JSON logs).
				// Pino logs are structured JSON; extractUserErrorMessage parses the "message" field.
				const combinedOutput = stderrTail || stdoutTail;
				const userMessage = extractUserErrorMessage(combinedOutput);
				agentStreamBus.emit(threadId, { type: 'error', message: userMessage });
			}
			// Always emit 'done' so the SSE subscriber can clean up
			agentStreamBus.emit(threadId, { type: 'done' });
		});

		child.on('error', async (spawnErr) => {
			logger.error({ err: spawnErr, agentId, threadId }, '[runtime] failed to spawn agent process');
			try {
				await this.sessionService.updateThreadStatus(threadId, 'error');
			} catch (updateErr) {
				logger.error({ updateErr, threadId }, '[runtime] failed to update thread status on error');
			}
			agentStreamBus.emit(threadId, {
				type: 'error',
				message: `Failed to start agent process: ${spawnErr.message}`,
			});
			agentStreamBus.emit(threadId, { type: 'done' });
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
	 * Build the AgentRuntimeConfig that is passed to the child via env var.
	 * Contains no secrets — API keys and credentials stay in the backend process.
	 *
	 * The agent object is passed in from spawnForThread to avoid a redundant DB fetch.
	 */
	private async buildRuntimeConfig(
		agent: Agent,
		threadId: string,
		ownerId: string,
		triggerType: AgentTriggerType,
		triggerPayload?: Record<string, unknown>,
		userDatetime?: string,
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
			embeddingModelConfigId: agent.embeddingModelConfigId,
			triggerType,
			triggerPayload,
			// User's local datetime — used to inject current date/time context into the system prompt.
			// Falls back to server time in agent-runner.ts when absent (cron/webhook/manual triggers).
			...(userDatetime !== undefined ? { userDatetime } : {}),
		};
	}
}

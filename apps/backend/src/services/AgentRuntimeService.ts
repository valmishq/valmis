import { spawn } from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import type { AgentTriggerType, AgentRuntimeConfig, Agent } from '@repo/types';
import { AgentSessionService } from './AgentSessionService.js';
import { AgentProxyService } from './AgentProxyService.js';
import { AgentService } from './AgentService.js';
import { LlmProviderService } from './llmProviderService.js';
import { agentStreamBus } from './AgentStreamBus.js';
import { logger } from '../config/logger.js';

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

		// Stream child stdout/stderr to logger
		child.stdout?.on('data', (data: Buffer) => {
			logger.info({ agentId, threadId }, `[agent] ${data.toString().trim()}`);
		});
		child.stderr?.on('data', (data: Buffer) => {
			logger.warn({ agentId, threadId }, `[agent:stderr] ${data.toString().trim()}`);
		});

		// Update thread status based on exit code.
		// On non-zero exit also emit an SSE error event so the browser can unlock the UI
		// (without this the isStreaming flag stays true indefinitely after a crash).
		child.on('close', async (code) => {
			const status = code === 0 ? 'completed' : 'error';
			logger.info({ agentId, threadId, code, status }, '[runtime] agent process exited');
			try {
				await this.sessionService.updateThreadStatus(threadId, status);
			} catch (err) {
				logger.error({ err, threadId }, '[runtime] failed to update thread status on exit');
			}

			if (code !== 0) {
				// Notify the browser so it can unblock the input field
				agentStreamBus.emit(threadId, {
					type: 'error',
					message: 'Agent process exited unexpectedly. Please try again.',
				});
			}
			// Always emit 'done' so the SSE subscriber can clean up
			agentStreamBus.emit(threadId, { type: 'done' });
		});

		child.on('error', async (err) => {
			logger.error({ err, agentId, threadId }, '[runtime] failed to spawn agent process');
			try {
				await this.sessionService.updateThreadStatus(threadId, 'error');
			} catch (updateErr) {
				logger.error({ updateErr, threadId }, '[runtime] failed to update thread status on error');
			}
			agentStreamBus.emit(threadId, {
				type: 'error',
				message: 'Failed to start agent process. Please try again.',
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

		return {
			agentId: agent.id,
			threadId,
			name: agent.name,
			systemInstruction: agent.systemInstruction ?? '',
			modelProvider,
			modelId,
			credentialIds: agent.credentialIds,
			triggerType,
			triggerPayload,
		};
	}
}

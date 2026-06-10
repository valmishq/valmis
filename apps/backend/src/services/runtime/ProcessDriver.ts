import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../../config/logger.js';
import type { ExecutionDriver, RuntimeHandle, RuntimeSpawnRequest } from './ExecutionDriver.js';

/** Grace period between SIGTERM and SIGKILL when killing a child process */
const KILL_GRACE_MS = 5_000;

/**
 * Runs the agent runtime as a plain Node.js child process on the host.
 *
 * This is the original (pre-driver) execution model: code-level isolation only.
 * The child runs as the same OS user as the backend — secrets are excluded from
 * its environment, but there is no filesystem/network/kernel boundary. Use the
 * docker driver for real isolation; this driver remains the zero-dependency
 * default for bare-metal development.
 */
export class ProcessDriver implements ExecutionDriver {
	readonly name = 'process' as const;

	/**
	 * Absolute path to the compiled agent-runtime entrypoint.
	 * Default: apps/agent-runtime/dist/index.js resolved relative to the repo root
	 * (process.cwd() is apps/backend/ in dev). Override with AGENT_RUNTIME_ENTRY.
	 */
	private readonly agentRuntimeEntry: string;

	/** PROXY_HOST for the child — the backend on localhost */
	private readonly proxyHostUrl: string;

	/** Live children, tracked for shutdown() */
	private readonly liveChildren = new Set<ChildProcess>();

	constructor() {
		this.agentRuntimeEntry =
			process.env.AGENT_RUNTIME_ENTRY ??
			resolve(process.cwd(), '../../apps/agent-runtime/dist/index.js');
		const backendPort = process.env.BACKEND_PORT ?? '4000';
		this.proxyHostUrl = `http://localhost:${backendPort}`;
	}

	async init(): Promise<void> {
		logger.info({ entry: this.agentRuntimeEntry }, '[runtime:process] driver initialised');
	}

	prepareWorkspace(workspacePath: string): void {
		mkdirSync(workspacePath, { recursive: true });
	}

	async spawn(req: RuntimeSpawnRequest): Promise<RuntimeHandle> {
		// Inherit PATH and HOME so `node` can resolve modules; everything else
		// comes from the sanitized request env.
		const childEnv: Record<string, string> = {
			PATH: process.env.PATH ?? '',
			HOME: process.env.HOME ?? '',
			...req.env,
			PROXY_HOST: this.proxyHostUrl,
			WORKSPACE_ROOT: req.workspacePath,
		};

		const child = spawn('node', [this.agentRuntimeEntry], {
			env: childEnv,
			stdio: ['ignore', 'pipe', 'pipe'],
			detached: false,
		});
		this.liveChildren.add(child);
		child.on('close', () => this.liveChildren.delete(child));

		return {
			id: String(child.pid ?? 'unknown'),
			onStdout: (cb) => child.stdout?.on('data', (data: Buffer) => cb(data.toString())),
			onStderr: (cb) => child.stderr?.on('data', (data: Buffer) => cb(data.toString())),
			onClose: (cb) => child.on('close', (code) => cb(code)),
			onError: (cb) => child.on('error', cb),
			kill: async () => {
				if (child.exitCode !== null || child.signalCode !== null) return;
				child.kill('SIGTERM');
				const killTimer = setTimeout(() => {
					if (child.exitCode === null && child.signalCode === null) {
						child.kill('SIGKILL');
					}
				}, KILL_GRACE_MS);
				// Don't keep the event loop alive just for the escalation timer
				killTimer.unref();
			},
		};
	}

	async shutdown(): Promise<void> {
		for (const child of this.liveChildren) {
			child.kill('SIGTERM');
		}
		this.liveChildren.clear();
	}
}

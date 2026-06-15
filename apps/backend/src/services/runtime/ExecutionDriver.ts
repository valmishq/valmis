/**
 * Execution driver abstraction for the agent runtime.
 *
 * One agent turn = one driver.spawn() call = one isolated execution unit
 * (a plain Node.js child process or a hardened Docker sibling container).
 *
 * The driver owns everything that differs between execution environments:
 *   - PROXY_HOST  — how the runtime reaches the backend (localhost vs docker network)
 *   - WORKSPACE_ROOT — where the agent's persistent workspace appears inside the unit
 *   - workspace preparation (ownership/permissions for the runtime user)
 *
 * AgentRuntimeService owns everything that doesn't: runtime config, proxy token,
 * thread status, SSE events, timeout, and concurrency limits.
 */

/** Sanitized spawn request — env never contains backend secrets. */
export interface RuntimeSpawnRequest {
	agentId: string;
	threadId: string;
	/**
	 * Whether the runtime may reach the public internet.
	 * Only enforced by the docker driver (network selection) — the process
	 * driver runs on the host network and cannot restrict egress.
	 */
	allowInternetAccess: boolean;
	/**
	 * Absolute path of the agent's workspace as seen by the BACKEND process
	 * (<AGENT_WORKSPACES_PATH>/<agentId>). The process driver passes it through
	 * as WORKSPACE_ROOT; the docker driver mounts the workspace into the
	 * container at /workspace instead (the mount source comes from the driver's
	 * own volume/host-path configuration).
	 */
	workspacePath: string;
	/**
	 * Sanitized environment: AGENT_ID, THREAD_ID, PROXY_TOKEN, RUNTIME_CONFIG, NODE_ENV.
	 * PROXY_HOST and WORKSPACE_ROOT are intentionally absent — they are
	 * driver-specific and injected by the driver itself.
	 */
	env: Record<string, string>;
}

/** Handle to a live execution unit (process or container). */
export interface RuntimeHandle {
	/** pid (process driver) or container id (docker driver) — for logging only */
	id: string;
	onStdout(cb: (chunk: string) => void): void;
	onStderr(cb: (chunk: string) => void): void;
	/** exitCode is null when the unit was killed by a signal/timeout */
	onClose(cb: (exitCode: number | null) => void): void;
	/** Failures surfaced after spawn() resolved (attach/stream errors) */
	onError(cb: (err: Error) => void): void;
	/** Force-terminate the unit. Must be safe to call after exit. */
	kill(): Promise<void>;
}

export interface ExecutionDriver {
	readonly name: 'process' | 'docker';
	/**
	 * Startup validation: check configuration (image present, daemon reachable,
	 * networks exist), and reap any orphaned execution units from a previous
	 * backend run. Must throw with a clear operator-facing message on
	 * misconfiguration so the backend fails fast at boot.
	 *
	 * `workspacesBasePath` is the backend-side base directory for per-agent
	 * workspaces (AGENT_WORKSPACES_PATH). The docker driver uses it to verify,
	 * at boot, that this path and its workspace volume resolve to the same
	 * physical storage (see DockerDriver). Other drivers may ignore it.
	 */
	init(workspacesBasePath?: string): Promise<void>;
	/**
	 * Ensure the per-agent workspace directory exists with the ownership the
	 * runtime user needs. Called by AgentRuntimeService before every spawn.
	 */
	prepareWorkspace(workspacePath: string): void;
	spawn(req: RuntimeSpawnRequest): Promise<RuntimeHandle>;
	/** Backend shutdown: kill all live execution units. */
	shutdown(): Promise<void>;
}

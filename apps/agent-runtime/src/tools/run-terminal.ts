import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { spawnSync } from 'child_process';
import { logger } from '@repo/utils';
import { resolveWorkspacePath } from './types.js';
import type { ToolContext } from './types.js';

/**
 * Maximum number of bytes captured from stdout + stderr combined.
 * Output beyond this limit is truncated to protect the context window.
 */
const MAX_OUTPUT_BYTES = 65_536; // 64 KB

/**
 * Hard wall-clock timeout for any single command (milliseconds).
 * spawnSync enforces this at the OS level — the child is SIGTERM'd on expiry.
 */
const DEFAULT_TIMEOUT_MS = 30_000; // 30 s

/**
 * Minimal environment injected into the child process.
 *
 * Only essential POSIX variables are forwarded.  Intentionally excluded:
 *   - NODE_ENV, PORT, DATABASE_URL, JWT_SECRET, PROXY_TOKEN, … (all app secrets)
 *   - WORKSPACE_ROOT (agent sets cwd directly; the model doesn't need this path)
 *
 * The model receives a clean, minimal environment similar to a restricted shell.
 */
const SAFE_ENV: Record<string, string> = {
	PATH: '/usr/local/bin:/usr/bin:/bin',
	HOME: '/tmp',
	TERM: 'dumb',
	LANG: 'en_US.UTF-8',
};

/**
 * run_terminal — Execute a shell command inside the agent's workspace.
 *
 * Security model:
 *   1. **CWD is locked to WORKSPACE_ROOT.** The child process starts in the
 *      agent's workspace directory.  Shell commands that try to `cd` outside
 *      it can do so at the OS level (we are not in Docker), but the workspace
 *      guard prevents file-tool operations from following.  The command itself
 *      is not shell-injected — it is parsed into program + args before being
 *      passed to spawn (no `shell: true`).
 *
 *   2. **No shell expansion.** `spawnSync` is called with `shell: false`.
 *      The model must pass the program and arguments separately.  This prevents
 *      `$(…)` / backtick injection, glob expansion, and semicolon chaining.
 *
 *   3. **Hard timeout.** Commands are killed (SIGTERM) after DEFAULT_TIMEOUT_MS.
 *      This prevents accidental infinite loops or blocking processes from
 *      hanging the agent turn.
 *
 *   4. **Output size cap.** stdout + stderr are truncated to MAX_OUTPUT_BYTES.
 *      A large `cat` or runaway output cannot blow out the LLM context window
 *      or exhaust the process heap.
 *
 *   5. **Minimal environment.** Only PATH, HOME, TERM, and LANG are forwarded.
 *      No app secrets, no API keys, no PROXY_TOKEN enter the subprocess.
 *
 *   6. **Non-zero exit is returned as content, not thrown.** The model receives
 *      the exit code and stderr so it can reason about failures without the
 *      tool being marked as an error (which would confuse the tool loop).
 *
 * Known limitations (acceptable for workspace-scoped agent use):
 *   - No OS-level sandbox (seccomp/namespaces).  The process inherits the same
 *     OS user as the agent runtime.  If you need stronger isolation, run the
 *     agent runtime itself inside a container or VM.
 *   - Interactive / TTY programs (editors, REPL prompts) will not work because
 *     stdin is closed.  Pass `--non-interactive` / `--batch` flags if needed.
 */
export function createRunTerminalTool(ctx: ToolContext): AgentTool {
	const tool: AgentTool = {
		name: 'run_terminal',
		label: 'Run Terminal Command',
		description:
			'Execute a terminal command in the workspace directory. ' +
			'The command runs with the workspace as the current working directory. ' +
			'No shell expansion or pipe chaining — pass the program and each argument separately. ' +
			`Commands are killed after ${DEFAULT_TIMEOUT_MS / 1000} seconds.`,
		parameters: Type.Object({
			program: Type.String({
				description:
					'The executable to run, e.g. "python3", "node", "git", "npm". ' +
					'Must be a single program name or absolute path — no shell operators.',
			}),
			args: Type.Optional(
				Type.Array(Type.String(), {
					description: 'Arguments to pass to the program as separate strings.',
				}),
			),
			cwd: Type.Optional(
				Type.String({
					description:
						'Subdirectory (relative to workspace root) to run the command in. ' +
						'Defaults to the workspace root.',
				}),
			),
		}),
		execute: async (_toolCallId, params) => {
			const {
				program,
				args = [],
				cwd: relativeCwd = '.',
			} = params as {
				program: string;
				args?: string[];
				cwd?: string;
			};

			// Resolve the working directory — still bounded to workspace root
			const workingDir = resolveWorkspacePath(ctx.workspaceRoot, relativeCwd);

			// Reject obvious shell-operator injection in the program name itself
			if (/[;&|`$<>(){}[\]!#\\]/.test(program)) {
				const textContent: TextContent = {
					type: 'text',
					text: 'Error: program name contains disallowed shell characters.',
				};
				return { content: [textContent], details: { exitCode: -1, timedOut: false } };
			}

			logger.info({ program, args, cwd: workingDir }, '[agent-runner] run_terminal executing');

			const result = spawnSync(program, args, {
				cwd: workingDir,
				env: SAFE_ENV,
				timeout: DEFAULT_TIMEOUT_MS,
				maxBuffer: MAX_OUTPUT_BYTES,
				encoding: 'utf-8',
				// No shell — prevents injection via the args themselves
				shell: false,
				// Close stdin so interactive prompts don't hang
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			const timedOut = result.signal === 'SIGTERM' && result.status === null;

			logger.debug(
				{ exitCode: result.status, timedOut, signal: result.signal },
				'[agent-runner] run_terminal done',
			);

			// Build a structured text response the model can parse
			const parts: string[] = [];

			if (timedOut) {
				parts.push(`[TIMEOUT after ${DEFAULT_TIMEOUT_MS / 1000}s — process was killed]`);
			}

			if (result.stdout) {
				const out = result.stdout.toString();
				if (out.length >= MAX_OUTPUT_BYTES) {
					parts.push(`[stdout truncated to ${MAX_OUTPUT_BYTES} bytes]`);
				}
				parts.push(`--- stdout ---\n${out}`);
			}

			if (result.stderr) {
				const err = result.stderr.toString();
				parts.push(`--- stderr ---\n${err}`);
			}

			const exitCode = result.status ?? (timedOut ? 124 : -1);
			parts.push(`--- exit code: ${exitCode} ---`);

			const textContent: TextContent = {
				type: 'text',
				text: parts.join('\n'),
			};

			return {
				content: [textContent],
				details: { exitCode, timedOut },
			};
		},
	};

	return tool;
}

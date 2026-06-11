import { mkdirSync, chownSync, chmodSync } from 'fs';
import { join } from 'path';
import { PassThrough } from 'stream';
import Docker from 'dockerode';
import { logger } from '../../config/logger.js';
import type { ExecutionDriver, RuntimeHandle, RuntimeSpawnRequest } from './ExecutionDriver.js';

/** Label applied to every runtime container — used for orphan reaping */
const RUNTIME_LABEL = 'openagent.runtime';

/** UID/GID of the non-root `agent` user inside the runtime image */
const RUNTIME_UID = 10001;

/** Result shape of Docker's POST /containers/:id/wait */
interface ContainerWaitResult {
	StatusCode: number;
}

/**
 * Runs each agent turn in a hardened sibling Docker container.
 *
 * Isolation model:
 *   - Own namespaces (pid/mnt/net/uts/ipc), read-only rootfs, non-root user,
 *     CapDrop ALL, no-new-privileges, memory/CPU/pids cgroup limits.
 *   - Only the agent's OWN workspace is mounted (volume subpath or host bind),
 *     writable at /workspace. tmpfs at /tmp.
 *   - Network: one of two pre-created docker networks, chosen per agent —
 *     the open network (internet egress allowed) or the internal network
 *     (can only reach the backend; all external calls go through the
 *     credential proxy).
 *   - Optional alternate OCI runtime (AGENT_RUNTIME_DOCKER_RUNTIME=runsc for
 *     gVisor on Linux hosts) for kernel-level hardening.
 *
 * The Docker daemon is reached via DOCKER_HOST when set (production: a
 * docker-socket-proxy service), otherwise /var/run/docker.sock (dev).
 */
export class DockerDriver implements ExecutionDriver {
	readonly name = 'docker' as const;

	private readonly docker: Docker;
	private readonly image: string;
	private readonly proxyHost: string;
	private readonly networkOpen: string;
	private readonly networkInternal: string;
	private readonly addHostGateway: boolean;
	private readonly workspaceVolume: string | undefined;
	private readonly workspaceHostPath: string | undefined;
	private readonly memoryLimitBytes: number;
	private readonly nanoCpus: number;
	private readonly pidsLimit: number;
	private readonly dockerRuntime: string | undefined;

	/** Live containers, tracked for shutdown() */
	private readonly liveContainers = new Set<Docker.Container>();

	constructor() {
		// dockerode's modem honours DOCKER_HOST / DOCKER_TLS_VERIFY / DOCKER_CERT_PATH
		// automatically; with none set it falls back to /var/run/docker.sock.
		this.docker = new Docker();
		this.image = process.env.AGENT_RUNTIME_IMAGE ?? 'logiclabshq/agent-runtime:latest';
		const backendPort = process.env.BACKEND_PORT ?? '4000';
		this.proxyHost =
			process.env.AGENT_RUNTIME_PROXY_HOST ?? `http://host.docker.internal:${backendPort}`;
		this.networkOpen = process.env.AGENT_RUNTIME_NETWORK ?? 'openagent_runtime';
		this.networkInternal =
			process.env.AGENT_RUNTIME_NETWORK_INTERNAL ?? 'openagent_runtime_internal';
		this.addHostGateway = process.env.AGENT_RUNTIME_ADD_HOST_GATEWAY === 'true';
		this.workspaceVolume = process.env.AGENT_RUNTIME_WORKSPACE_VOLUME;
		this.workspaceHostPath = process.env.AGENT_RUNTIME_WORKSPACE_HOST_PATH;
		this.memoryLimitBytes =
			parseInt(process.env.AGENT_RUNTIME_MEMORY_LIMIT_MB ?? '1024', 10) * 1024 * 1024;
		this.nanoCpus = Math.round(parseFloat(process.env.AGENT_RUNTIME_CPU_LIMIT ?? '1') * 1e9);
		this.pidsLimit = parseInt(process.env.AGENT_RUNTIME_PIDS_LIMIT ?? '256', 10);
		this.dockerRuntime = process.env.AGENT_RUNTIME_DOCKER_RUNTIME;
	}

	async init(): Promise<void> {
		if (!this.workspaceVolume && !this.workspaceHostPath) {
			throw new Error(
				'[runtime:docker] AGENT_RUNTIME_WORKSPACE_VOLUME (production, named volume with subpath mounts) ' +
					'or AGENT_RUNTIME_WORKSPACE_HOST_PATH (dev, host bind mounts) must be set when AGENT_RUNTIME_DRIVER=docker',
			);
		}

		// Daemon reachability + version. Volume subpath mounts need API >= 1.45 (Engine 26).
		let version: Docker.DockerVersion;
		try {
			version = await this.docker.version();
		} catch (err) {
			throw new Error(
				`[runtime:docker] cannot reach the Docker daemon (DOCKER_HOST=${process.env.DOCKER_HOST ?? '/var/run/docker.sock'}): ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		if (this.workspaceVolume) {
			const [major, minor] = version.ApiVersion.split('.').map((p) => parseInt(p, 10));
			if (major < 1 || (major === 1 && minor < 45)) {
				throw new Error(
					`[runtime:docker] Docker API ${version.ApiVersion} does not support volume subpath mounts ` +
						'(requires API >= 1.45 / Engine >= 26). Upgrade Docker or use AGENT_RUNTIME_WORKSPACE_HOST_PATH instead.',
				);
			}
		}

		// Refresh the runtime image from the registry ONCE per backend startup —
		// never during a user turn (a per-spawn pull would add seconds to every
		// message). A stale local tag (e.g. :latest) is otherwise never updated,
		// so published runtime image updates would silently not deploy. When the
		// local image is already current the pull is a fast no-op (digest check,
		// no layer downloads). If the registry is unreachable but a local image
		// exists, continue with it; fail the boot only when there is no image at
		// all (from-source deployments get the local build command in the error).
		try {
			const pullStream = await this.docker.pull(this.image);
			await new Promise<void>((resolvePull, rejectPull) => {
				this.docker.modem.followProgress(pullStream, (err) =>
					err ? rejectPull(err) : resolvePull(),
				);
			});
			logger.info({ image: this.image }, '[runtime:docker] runtime image up to date');
		} catch (pullErr) {
			try {
				await this.docker.getImage(this.image).inspect();
				logger.warn(
					{ image: this.image, pullErr },
					'[runtime:docker] registry pull failed — continuing with the local runtime image',
				);
			} catch {
				throw new Error(
					`[runtime:docker] agent runtime image "${this.image}" not found locally and could not be pulled ` +
						`(${pullErr instanceof Error ? pullErr.message : String(pullErr)}). ` +
						'For from-source deployments, build it with: docker compose -f docker-compose.build.yml build agent-runtime',
				);
			}
		}

		await this.ensureNetwork(this.networkOpen, false);
		await this.ensureNetwork(this.networkInternal, true);
		await this.reapOrphans();

		logger.info(
			{
				image: this.image,
				proxyHost: this.proxyHost,
				networkOpen: this.networkOpen,
				networkInternal: this.networkInternal,
				workspaceVolume: this.workspaceVolume,
				workspaceHostPath: this.workspaceHostPath,
				dockerRuntime: this.dockerRuntime,
				engine: version.Version,
			},
			'[runtime:docker] driver initialised',
		);
	}

	prepareWorkspace(workspacePath: string): void {
		mkdirSync(workspacePath, { recursive: true });
		// The runtime container runs as the non-root `agent` user (RUNTIME_UID) —
		// the workspace dir is created by the backend (root in the production
		// image) and must be readable and writable by that user.
		try {
			chownSync(workspacePath, RUNTIME_UID, RUNTIME_UID);
		} catch (chownErr) {
			// chown to an arbitrary uid fails on rootless/userns-remapped Docker
			// daemons and on macOS dev. Fall back to world-writable — chmod only
			// requires owning the dir, which the backend does in all of those
			// environments. Exposure is minimal: this is a per-agent data dir that
			// only the backend and that agent's own runtime containers ever mount.
			try {
				chmodSync(workspacePath, 0o777);
				logger.warn(
					{ workspacePath },
					'[runtime:docker] workspace chown to runtime uid failed — fell back to chmod 777',
				);
			} catch (chmodErr) {
				// Neither worked — the agent's file tools would fail with EACCES on
				// every call. Fail the spawn loudly instead.
				logger.error(
					{ chownErr, chmodErr, workspacePath },
					'[runtime:docker] cannot make workspace writable for the runtime user',
				);
				throw new Error(
					`[runtime:docker] workspace "${workspacePath}" cannot be made writable for the runtime user (uid ${RUNTIME_UID})`,
				);
			}
		}
	}

	async spawn(req: RuntimeSpawnRequest): Promise<RuntimeHandle> {
		const env = {
			...req.env,
			PROXY_HOST: this.proxyHost,
			WORKSPACE_ROOT: '/workspace',
		};

		const container = await this.docker.createContainer({
			Image: this.image,
			Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
			Labels: {
				[RUNTIME_LABEL]: 'true',
				'openagent.agent': req.agentId,
				'openagent.thread': req.threadId,
			},
			User: `${RUNTIME_UID}:${RUNTIME_UID}`,
			WorkingDir: '/workspace',
			HostConfig: {
				AutoRemove: true,
				NetworkMode: req.allowInternetAccess ? this.networkOpen : this.networkInternal,
				...(this.addHostGateway ? { ExtraHosts: ['host.docker.internal:host-gateway'] } : {}),
				Mounts: [this.buildWorkspaceMount(req.agentId)],
				Memory: this.memoryLimitBytes,
				// MemorySwap == Memory disables swap entirely
				MemorySwap: this.memoryLimitBytes,
				NanoCpus: this.nanoCpus,
				PidsLimit: this.pidsLimit,
				CapDrop: ['ALL'],
				SecurityOpt: ['no-new-privileges'],
				ReadonlyRootfs: true,
				// No noexec: run_terminal/run_code set HOME=/tmp and pip/npm user
				// installs must be able to execute from there.
				Tmpfs: { '/tmp': 'rw,nosuid,size=256m' },
				...(this.dockerRuntime ? { Runtime: this.dockerRuntime } : {}),
			},
		});
		this.liveContainers.add(container);

		// Attach BEFORE start so no early log output is lost. The multiplexed
		// stream is demuxed into separate stdout/stderr channels.
		const attachStream = await container.attach({ stream: true, stdout: true, stderr: true });
		const stdout = new PassThrough();
		const stderr = new PassThrough();
		this.docker.modem.demuxStream(attachStream, stdout, stderr);

		await container.start();

		const handle: RuntimeHandle = {
			id: container.id.slice(0, 12),
			onStdout: (cb) => stdout.on('data', (data: Buffer) => cb(data.toString())),
			onStderr: (cb) => stderr.on('data', (data: Buffer) => cb(data.toString())),
			onClose: (cb) => {
				container
					.wait()
					.then((result: ContainerWaitResult) => {
						this.liveContainers.delete(container);
						cb(result.StatusCode);
					})
					.catch((err: Error) => {
						// wait() can fail if the container was force-removed (kill/reap race)
						this.liveContainers.delete(container);
						logger.warn(
							{ err, containerId: container.id },
							'[runtime:docker] container wait failed',
						);
						cb(null);
					});
			},
			onError: (cb) => attachStream.on('error', cb),
			kill: async () => {
				try {
					await container.kill();
				} catch (err) {
					// Already exited and auto-removed — nothing to do
					logger.debug(
						{ err, containerId: container.id },
						'[runtime:docker] kill skipped (container gone)',
					);
				}
			},
		};
		return handle;
	}

	async shutdown(): Promise<void> {
		const killAll = [...this.liveContainers].map(async (container) => {
			try {
				await container.kill();
			} catch {
				// Already gone
			}
		});
		await Promise.all(killAll);
		this.liveContainers.clear();
	}

	/**
	 * Workspace mount for one agent. Never mounts the whole workspaces volume —
	 * that would expose every agent's files to every runtime.
	 */
	private buildWorkspaceMount(agentId: string): Docker.MountSettings {
		if (this.workspaceVolume) {
			return {
				Type: 'volume',
				Source: this.workspaceVolume,
				Target: '/workspace',
				VolumeOptions: {
					NoCopy: false,
					Labels: {},
					DriverConfig: { Name: '', Options: {} },
					Subpath: agentId,
				},
			};
		}
		// Dev: bind mount. The source must be a HOST path — sibling container
		// mounts are resolved by the daemon on the host, not inside this container.
		return {
			Type: 'bind',
			Source: join(this.workspaceHostPath as string, agentId),
			Target: '/workspace',
		};
	}

	/** Create the named network if it does not exist yet (dev convenience —
	 *  in production compose pre-creates both networks). */
	private async ensureNetwork(name: string, internal: boolean): Promise<void> {
		try {
			await this.docker.getNetwork(name).inspect();
		} catch {
			logger.info({ network: name, internal }, '[runtime:docker] creating missing network');
			await this.docker.createNetwork({
				Name: name,
				Internal: internal,
				Labels: { [RUNTIME_LABEL]: 'true' },
			});
		}
	}

	/**
	 * Remove containers left over from a previous backend run. Safe: any
	 * survivor's PROXY_TOKEN has expired and its thread was already abandoned
	 * when the backend restarted.
	 */
	private async reapOrphans(): Promise<void> {
		const orphans = await this.docker.listContainers({
			all: true,
			filters: { label: [`${RUNTIME_LABEL}=true`] },
		});
		for (const info of orphans) {
			logger.warn(
				{ containerId: info.Id.slice(0, 12), labels: info.Labels },
				'[runtime:docker] removing orphaned runtime container',
			);
			try {
				await this.docker.getContainer(info.Id).remove({ force: true });
			} catch (err) {
				logger.warn({ err, containerId: info.Id }, '[runtime:docker] failed to remove orphan');
			}
		}
	}
}

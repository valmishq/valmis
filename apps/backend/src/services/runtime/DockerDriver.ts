import { mkdirSync, chownSync, chmodSync, rmSync, readFileSync } from 'fs';
import { lookup as dnsLookup } from 'dns/promises';
import { hostname } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import Docker from 'dockerode';
import { logger } from '../../config/logger.js';
import type { ExecutionDriver, RuntimeHandle, RuntimeSpawnRequest } from './ExecutionDriver.js';

/** Label applied to every runtime container — used for orphan reaping */
const RUNTIME_LABEL = 'valmis.runtime';

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
	// The configured PROXY_HOST (env or default). The effective per-network hosts
	// below are reconciled from it at init() — a renaming orchestrator can make the
	// configured hostname unresolvable on the runtime network even though the
	// container is correctly attached, so we fall back to the backend's own IP.
	private readonly proxyHost: string;
	private proxyHostOpen: string;
	private proxyHostInternal: string;
	// Network + workspace identifiers are resolved from env at construction, then
	// reconciled against the backend's OWN container at init() (autoConfigureFromSelf)
	// — they are not readonly because a renaming orchestrator (e.g. Coolify) may
	// give the live resources different names than the env defaults.
	private networkOpen: string;
	private networkInternal: string;
	private readonly addHostGateway: boolean;
	private workspaceVolume: string | undefined;
	private workspaceHostPath: string | undefined;
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
		this.image = process.env.AGENT_RUNTIME_IMAGE ?? 'ghcr.io/valmishq/agent-runtime:latest';
		const backendPort = process.env.BACKEND_PORT ?? '4000';
		this.proxyHost =
			process.env.AGENT_RUNTIME_PROXY_HOST ?? `http://host.docker.internal:${backendPort}`;
		// Effective hosts default to the configured one; init() substitutes the
		// backend's per-network IP when the configured hostname is unresolvable.
		this.proxyHostOpen = this.proxyHost;
		this.proxyHostInternal = this.proxyHost;
		this.networkOpen = process.env.AGENT_RUNTIME_NETWORK ?? 'valmis_runtime';
		this.networkInternal = process.env.AGENT_RUNTIME_NETWORK_INTERNAL ?? 'valmis_runtime_internal';
		this.addHostGateway = process.env.AGENT_RUNTIME_ADD_HOST_GATEWAY === 'true';
		this.workspaceVolume = process.env.AGENT_RUNTIME_WORKSPACE_VOLUME;
		this.workspaceHostPath = process.env.AGENT_RUNTIME_WORKSPACE_HOST_PATH;
		this.memoryLimitBytes =
			parseInt(process.env.AGENT_RUNTIME_MEMORY_LIMIT_MB ?? '1024', 10) * 1024 * 1024;
		this.nanoCpus = Math.round(parseFloat(process.env.AGENT_RUNTIME_CPU_LIMIT ?? '1') * 1e9);
		this.pidsLimit = parseInt(process.env.AGENT_RUNTIME_PIDS_LIMIT ?? '256', 10);
		this.dockerRuntime = process.env.AGENT_RUNTIME_DOCKER_RUNTIME;
	}

	async init(workspacesBasePath?: string): Promise<void> {
		// Reconcile the env-configured volume/network names against the resources the
		// backend's OWN container is actually attached to. A renaming orchestrator
		// (Coolify, Dokploy) rewrites compose volume/network names to project-scoped
		// ones, so the hardcoded env defaults would point at the wrong (or empty,
		// auto-created) resources. Self-detection makes the driver correct everywhere.
		if (workspacesBasePath) {
			await this.autoConfigureFromSelf(workspacesBasePath);
		}

		if (!this.workspaceVolume && !this.workspaceHostPath) {
			throw new Error(
				'[runtime:docker] could not determine the agent workspace storage: set ' +
					'AGENT_RUNTIME_WORKSPACE_VOLUME (production, named volume with subpath mounts) ' +
					'or AGENT_RUNTIME_WORKSPACE_HOST_PATH (dev, host bind mounts), or run the backend ' +
					'as a container so the workspace mount can be auto-detected',
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

		// Verify the cross-mount workspace contract before serving any turn, so a
		// misconfigured volume fails the boot with a clear message instead of a
		// cryptic per-message 404 (and silently broken skill materialization).
		if (workspacesBasePath) {
			await this.verifyWorkspaceContract(workspacesBasePath);
		}

		logger.info(
			{
				image: this.image,
				proxyHostOpen: this.proxyHostOpen,
				proxyHostInternal: this.proxyHostInternal,
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
		// The runtime joins one of two networks; the backend's reachable address may
		// differ per network (see resolveProxyHost), so pick the matching one.
		const proxyHost = req.allowInternetAccess ? this.proxyHostOpen : this.proxyHostInternal;
		const env = {
			...req.env,
			PROXY_HOST: proxyHost,
			WORKSPACE_ROOT: '/workspace',
		};

		const container = await this.docker.createContainer({
			Image: this.image,
			Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
			Labels: {
				[RUNTIME_LABEL]: 'true',
				'valmis.agent': req.agentId,
				'valmis.thread': req.threadId,
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
	 * Reconcile the env-configured workspace volume + runtime network names against
	 * the resources the backend's OWN container is actually attached to.
	 *
	 * Orchestrators that rename compose resources (Coolify rewrites volumes to
	 * `<project-uuid>_<key>`, leaving the env defaults pointing at the wrong — or an
	 * empty, auto-created — volume/network) would otherwise silently break every
	 * spawn. For each value we trust the configured name only when the backend is
	 * really attached to it; otherwise we substitute the real one. Best-effort: any
	 * failure logs a warning and leaves the configured names untouched.
	 */
	private async autoConfigureFromSelf(workspacesBasePath: string): Promise<void> {
		let info: Docker.ContainerInspectInfo;
		try {
			info = await this.docker.getContainer(this.resolveSelfContainerId()).inspect();
		} catch (err) {
			logger.warn(
				{ err },
				'[runtime:docker] could not inspect own container — keeping env-configured volume/network names',
			);
			return;
		}

		// Workspace storage: whatever volume/bind backs the workspaces base path.
		const mount = (info.Mounts ?? []).find((m) => m.Destination === workspacesBasePath);
		if (!mount) {
			logger.warn(
				{ workspacesBasePath },
				'[runtime:docker] no mount at the workspaces base path on the backend container — keeping env-configured workspace storage',
			);
		} else if (mount.Type === 'volume' && mount.Name) {
			if (this.workspaceVolume !== mount.Name) {
				logger.warn(
					{ configured: this.workspaceVolume ?? null, detected: mount.Name, workspacesBasePath },
					'[runtime:docker] workspace volume auto-detected from the backend mount (overriding AGENT_RUNTIME_WORKSPACE_VOLUME)',
				);
			}
			this.workspaceVolume = mount.Name;
			this.workspaceHostPath = undefined;
		} else if (mount.Type === 'bind') {
			if (this.workspaceHostPath !== mount.Source) {
				logger.warn(
					{
						configured: this.workspaceHostPath ?? null,
						detected: mount.Source,
						workspacesBasePath,
					},
					'[runtime:docker] workspace host path auto-detected from the backend mount (overriding AGENT_RUNTIME_WORKSPACE_HOST_PATH)',
				);
			}
			this.workspaceHostPath = mount.Source;
			this.workspaceVolume = undefined;
		}

		// Runtime networks: the open + internal nets the backend itself is on.
		const attached = Object.keys(info.NetworkSettings?.Networks ?? {});
		this.networkOpen = await this.resolveRuntimeNetwork(attached, this.networkOpen, false);
		this.networkInternal = await this.resolveRuntimeNetwork(attached, this.networkInternal, true);

		// Proxy host: same trust-then-substitute philosophy as networks/volumes.
		// The runtime calls back to the backend at AGENT_RUNTIME_PROXY_HOST, but a
		// renaming orchestrator makes the compose service name (e.g. `app`)
		// unresolvable on the runtime network even though the container is correctly
		// attached — silently breaking every spawn's callbacks. Resolved per network
		// because the backend has a different IP on each.
		this.proxyHostOpen = await this.resolveProxyHost(info, this.networkOpen);
		this.proxyHostInternal = await this.resolveProxyHost(info, this.networkInternal);

		logger.info(
			{
				workspaceVolume: this.workspaceVolume ?? null,
				workspaceHostPath: this.workspaceHostPath ?? null,
				networkOpen: this.networkOpen,
				networkInternal: this.networkInternal,
				proxyHostOpen: this.proxyHostOpen,
				proxyHostInternal: this.proxyHostInternal,
			},
			'[runtime:docker] resolved runtime resources from backend container',
		);
	}

	/**
	 * Decide the proxy host a runtime on `networkName` should call back on.
	 *
	 * Trust the configured AGENT_RUNTIME_PROXY_HOST when its hostname is resolvable,
	 * otherwise substitute the backend's own IP on that network. The check is sound
	 * because the backend and a runtime on the same network share Docker's embedded
	 * DNS resolver (127.0.0.11 via /etc/resolv.conf, which getaddrinfo/dns.lookup
	 * honours): if the backend can resolve the hostname, a runtime on that network
	 * can too. A literal IP resolves trivially, so an explicit IP override is kept.
	 * The backend's per-network IP is always reachable because the runtime joins
	 * exactly that network. Best-effort: any uncertainty keeps the configured host.
	 */
	private async resolveProxyHost(
		info: Docker.ContainerInspectInfo,
		networkName: string,
	): Promise<string> {
		let host: string;
		try {
			host = new URL(this.proxyHost).hostname;
		} catch {
			// Not a parseable URL — leave the operator's value untouched.
			return this.proxyHost;
		}

		try {
			await dnsLookup(host);
			return this.proxyHost;
		} catch {
			// Unresolvable on the shared embedded DNS — fall through to IP substitution.
		}

		const ip = info.NetworkSettings?.Networks?.[networkName]?.IPAddress;
		if (!ip) {
			logger.warn(
				{ configured: this.proxyHost, networkName },
				'[runtime:docker] proxy host unresolvable and backend has no IP on the runtime network — keeping configured host',
			);
			return this.proxyHost;
		}

		const port = process.env.BACKEND_PORT ?? '4000';
		const substituted = `http://${ip}:${port}`;
		logger.warn(
			{ configured: this.proxyHost, substituted, networkName },
			'[runtime:docker] configured proxy host is unresolvable on the runtime network — substituting the backend IP (set AGENT_RUNTIME_PROXY_HOST to a resolvable host to override)',
		);
		return substituted;
	}

	/**
	 * Best-effort discovery of this backend container's id for a self-inspect.
	 * Primary: the 64-hex id in /proc/self/mountinfo (the /etc/hostname, /etc/hosts
	 * and /etc/resolv.conf binds live under /var/lib/docker/containers/<id>/...).
	 * Fallback: the hostname, which Docker sets to the short container id by default.
	 */
	private resolveSelfContainerId(): string {
		try {
			const mountinfo = readFileSync('/proc/self/mountinfo', 'utf8');
			const match = mountinfo.match(/\/containers\/([0-9a-f]{64})\//);
			if (match) return match[1];
		} catch {
			// /proc unavailable (non-Linux dev) — fall through to the hostname.
		}
		return hostname();
	}

	/**
	 * Pick the runtime network of the requested kind from the nets the backend is
	 * attached to. Trust the configured name when the backend is on it; otherwise
	 * classify the remaining attachments by their Internal flag (+ name hints),
	 * never selecting the app's default network (shared with other services). Falls
	 * back to the configured name when nothing matches (ensureNetwork creates it).
	 */
	private async resolveRuntimeNetwork(
		attached: string[],
		configured: string,
		wantInternal: boolean,
	): Promise<string> {
		if (attached.includes(configured)) return configured;

		for (const name of attached) {
			if (name === 'bridge' || name === 'host' || name === 'none') continue;
			if (/(^|[_-])default$/i.test(name)) continue;
			if (wantInternal && !/internal|runtime|agent/i.test(name)) continue;
			if (!wantInternal && (!/runtime|agent/i.test(name) || /internal/i.test(name))) continue;

			let isInternal: boolean;
			try {
				isInternal = (await this.docker.getNetwork(name).inspect()).Internal === true;
			} catch {
				continue;
			}
			if (isInternal !== wantInternal) continue;

			logger.warn(
				{ configured, detected: name, wantInternal },
				'[runtime:docker] runtime network auto-detected from backend attachments (overriding env)',
			);
			return name;
		}

		logger.warn(
			{ configured, wantInternal, attached },
			'[runtime:docker] no matching runtime network among backend attachments — keeping configured name (ensureNetwork creates it if missing)',
		);
		return configured;
	}

	/**
	 * Boot-time self-check for the named-volume workspace model.
	 *
	 * The backend writes each agent's workspace (and materialized skills) to
	 * <workspacesBasePath>/<agentId> via its OWN volume mount, while runtime
	 * containers mount only <volume>/<agentId> as a subpath. Both MUST be the
	 * same physical volume or the daemon's subpath lookup fails with
	 * "cannot access path ... no such file or directory" on every spawn (and
	 * skill files silently never reach the runtime).
	 *
	 * This verifies the contract once at startup by creating a probe directory
	 * via the backend mount and round-tripping a throwaway container that mounts
	 * the same path as a volume subpath. Only relevant to the volume model — the
	 * dev host-path bind model shares the host filesystem directly.
	 */
	private async verifyWorkspaceContract(workspacesBasePath: string): Promise<void> {
		if (!this.workspaceVolume) return;

		const PROBE_SUBPATH = '.contract-probe';
		const probeDir = join(workspacesBasePath, PROBE_SUBPATH);
		let container: Docker.Container | undefined;
		try {
			mkdirSync(probeDir, { recursive: true });
			container = await this.docker.createContainer({
				Image: this.image,
				Cmd: ['/bin/true'],
				Labels: { [RUNTIME_LABEL]: 'true' },
				HostConfig: { Mounts: [this.buildWorkspaceMount(PROBE_SUBPATH)] },
			});
			await container.start();
			await container.wait();
			logger.info(
				{ workspacesBasePath, workspaceVolume: this.workspaceVolume },
				'[runtime:docker] workspace volume contract verified',
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (/cannot access path|no such file or directory/i.test(message)) {
				throw new Error(
					'[runtime:docker] workspace volume contract is broken: the backend writes agent ' +
						`workspaces to "${workspacesBasePath}" (AGENT_WORKSPACES_PATH) but runtime containers ` +
						`mount subpaths of docker volume "${this.workspaceVolume}" ` +
						'(AGENT_RUNTIME_WORKSPACE_VOLUME) — these must resolve to the SAME physical volume. ' +
						'The probe directory created by the backend was not visible to the daemon inside the ' +
						`volume. Ensure the app service mounts volume "${this.workspaceVolume}" at ` +
						`"${workspacesBasePath}" (original error: ${message})`,
				);
			}
			throw new Error(`[runtime:docker] workspace volume contract self-check failed: ${message}`);
		} finally {
			if (container) {
				try {
					await container.remove({ force: true });
				} catch {
					// Already gone (e.g. wait() completed and it was reaped) — nothing to do.
				}
			}
			try {
				rmSync(probeDir, { recursive: true, force: true });
			} catch {
				// Best-effort cleanup — a leftover empty probe dir is harmless.
			}
		}
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

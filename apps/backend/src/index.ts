import express from 'express';
import { logger } from './config/logger.js';
import { corsMiddleware } from './middleware/cors.js';
import { rateLimiter } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { createCredentialsRouter } from './routes/credentials.js';
import { createOAuth2Router } from './routes/oauth2.js';
import { createLlmProvidersRouter } from './routes/llmProviders.js';
import { createAuthRouter } from './routes/auth.js';
import { createUsersRouter } from './routes/users.js';
import { createApiKeysRouter } from './routes/apiKeys.js';
import { createIamRouter } from './routes/iam.js';
import { createAgentsRouter } from './routes/agents.js';
import { createSkillsRouter } from './routes/skills.js';
import { createRuntimeRouter } from './routes/runtime.js';
import { createWebhooksRouter } from './routes/webhooks.js';
import { createWorkflowsRouter } from './routes/workflows.js';
import { createChannelsRouter } from './routes/channels.js';
import { ChannelService } from './services/ChannelService.js';
import { MessagePipeline } from './channels/pipeline.js';
import { ContentProcessor } from './channels/processor.js';
import { WebAdapter } from './channels/web/adapter.js';
import { TelegramPollerManager } from './channels/telegram/poller-manager.js';
import { DiscordGatewayManager } from './channels/discord/gateway-manager.js';
import { UserService } from './services/UserService.js';
import { AuthService } from './services/AuthService.js';
import { EncryptionService } from './services/EncryptionService.js';
import { CredentialService } from './services/CredentialService.js';
import { CredentialResolverService } from './services/CredentialResolverService.js';
import { AgentService } from './services/AgentService.js';
import { AgentMemoryService } from './services/AgentMemoryService.js';
import { LlmProviderService } from './services/llmProviderService.js';
import { AgentSessionService } from './services/AgentSessionService.js';
import { agentStreamBus } from './services/AgentStreamBus.js';
import { AgentProxyService } from './services/AgentProxyService.js';
import { AgentLlmProxyService } from './services/AgentLlmProxyService.js';
import { AgentRuntimeService } from './services/AgentRuntimeService.js';
import { ProcessDriver } from './services/runtime/ProcessDriver.js';
import { DockerDriver } from './services/runtime/DockerDriver.js';
import type { ExecutionDriver } from './services/runtime/ExecutionDriver.js';
import { TriggerService } from './services/TriggerService.js';
import { WorkflowService } from './services/WorkflowService.js';
import { WorkflowRunService } from './services/WorkflowRunService.js';

// --- Validate required environment variables at startup ---
const { JWT_SECRET, JWT_EXPIRES_IN, PROXY_TOKEN_SECRET } = process.env;
if (!JWT_SECRET || !JWT_EXPIRES_IN) {
	throw new Error('Missing required env vars: JWT_SECRET and JWT_EXPIRES_IN must be set');
}
if (!PROXY_TOKEN_SECRET) {
	throw new Error('Missing required env var: PROXY_TOKEN_SECRET must be set');
}

// --- Instantiate shared services ---
const userService = new UserService();
const authService = new AuthService(userService, JWT_SECRET, JWT_EXPIRES_IN);

// --- Instantiate runtime services ---
// EncryptionService reads CREDENTIAL_ENCRYPTION_KEY from env and throws if missing
const encryptionService = new EncryptionService();
const credentialService = new CredentialService(encryptionService);
const credentialResolverService = new CredentialResolverService(credentialService);
const agentService = new AgentService();
const llmProviderService = new LlmProviderService(encryptionService);
const agentMemoryService = new AgentMemoryService(
	agentService,
	llmProviderService,
	encryptionService,
);
const sessionService = new AgentSessionService();
const proxyService = new AgentProxyService(credentialResolverService, PROXY_TOKEN_SECRET);
const llmProxyService = new AgentLlmProxyService(
	proxyService,
	agentService,
	llmProviderService,
	encryptionService,
	agentStreamBus,
	sessionService,
	agentMemoryService,
);
// Execution driver — how agent runtimes are isolated:
//   process (default) — plain Node.js child process, code-level isolation only.
//   docker            — hardened sibling Docker container (recommended; set in
//                       docker-compose). Requires the runtime image and a
//                       reachable Docker daemon (DOCKER_HOST or docker.sock).
const executionDriver: ExecutionDriver =
	process.env.AGENT_RUNTIME_DRIVER === 'docker' ? new DockerDriver() : new ProcessDriver();
const runtimeService = new AgentRuntimeService(
	executionDriver,
	sessionService,
	proxyService,
	agentService,
	llmProviderService,
	credentialService,
);

// --- Instantiate channel services ---
const channelService = new ChannelService();
const contentProcessor = new ContentProcessor();
const webAdapter = new WebAdapter();
// messagePipeline is constructed here so it is accessible to both the runtime
// router (which calls pipeline.process() for the web POST /messages handler)
// and the channel pollers/gateways. The pipeline holds no per-request state
// so it is safe to share as a singleton. Each caller passes the adapter that
// received the message, so responses route back through the correct bot.
const messagePipeline = new MessagePipeline(
	sessionService,
	runtimeService,
	proxyService,
	llmProxyService,
	agentService,
	contentProcessor,
);

// TelegramPollerManager — starts long-polling loops for all active bot credentials.
// Instantiated here (not in the route) because it needs access to the pipeline
// which is wired before routes are mounted.
const telegramPollerManager = new TelegramPollerManager(
	credentialService,
	channelService,
	agentService,
	sessionService,
	messagePipeline,
);

// DiscordGatewayManager — starts Gateway WebSocket connections for all active bot credentials.
// Same pattern as TelegramPollerManager but uses Discord's WebSocket Gateway instead of polling.
const discordGatewayManager = new DiscordGatewayManager(
	credentialService,
	channelService,
	agentService,
	sessionService,
	messagePipeline,
);

// --- Instantiate workflow services ---
const workflowService = new WorkflowService();
const workflowRunService = new WorkflowRunService();

// TriggerService now accepts WorkflowService + WorkflowRunService for workflow routing
const triggerService = new TriggerService(
	runtimeService,
	sessionService,
	workflowService,
	workflowRunService,
);

const app = express();
const PORT = process.env.BACKEND_PORT ?? 4000;

// Number of trusted reverse proxy hops in front of this app (e.g. 1 for nginx).
// Must be a number — express-rate-limit v8 rejects the boolean `true` because it
// allows clients to spoof X-Forwarded-For and bypass IP-based rate limiting.
// Use 0 for local dev (no proxy), 1 for a single nginx/load-balancer hop, etc.
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10));

// --- Global middleware ---
app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiter — applied globally with public endpoint exclusions
app.use((req, res, next) => {
	const excluded = [
		/^\/v1\/auth\/status$/,
		/^\/v1\/auth\/setup$/,
		/^\/v1\/health$/,
		// OAuth2 callback must remain public — the provider redirects here without a token
		/^\/v1\/oauth2\/callback$/,
		// Webhook endpoints are called by external services at arbitrary frequency;
		// IP-based rate limiting would drop legitimate high-volume events.
		/^\/v1\/webhooks\//,
		// Sandbox-internal endpoints are called by agent child processes (localhost),
		// not by browser clients. All sandbox calls originate from 127.0.0.1, so they
		// would all share a single IP bucket and exhaust it quickly during active turns
		// (llm/stream + proxy + message appends + memory writes + workflow step logs per turn).
		// These routes are already secured by PROXY_TOKEN verification — rate limiting adds no value.
		/^\/v1\/runtime\/internal\//,
		// SSE stream endpoint — the browser holds this connection open for the duration
		// of an agent turn. Reconnects (network drops, tab focus events) count against
		// the per-IP limit. Excluding it prevents false-positive 429s on the stream.
		// The endpoint itself is protected by requireAuth (JWT/API-key).
		/^\/v1\/runtime\/[^/]+\/threads\/[^/]+\/stream$/,
	];
	if (excluded.some((p) => p.test(req.path))) return next();
	return rateLimiter(req, res, next);
});

// --- v1 routes ---
app.use('/v1/health', healthRouter);
app.use(
	'/v1/credentials',
	createCredentialsRouter(authService, (credentialId) => {
		// Stop any channel bot poller/gateway still running on the deleted
		// credential's token. Both calls are no-ops if nothing is tracked.
		telegramPollerManager.stopPoller(credentialId);
		discordGatewayManager.stopGateway(credentialId);
	}),
);
app.use('/v1/oauth2', createOAuth2Router(authService));
app.use('/v1/llm-providers', createLlmProvidersRouter(authService));
app.use('/v1/auth', createAuthRouter(authService));
app.use('/v1/users', createUsersRouter(authService));
app.use('/v1/api-keys', createApiKeysRouter(authService));
app.use('/v1/iam', createIamRouter(authService));
app.use('/v1/agents', createAgentsRouter(authService));
app.use('/v1/skills', createSkillsRouter(authService));

// Runtime routes — user-facing + sandbox-internal (PROXY_TOKEN auth)
app.use(
	'/v1/runtime',
	createRuntimeRouter(
		authService,
		sessionService,
		runtimeService,
		proxyService,
		llmProxyService,
		triggerService,
		agentMemoryService,
		workflowRunService,
		workflowService,
		messagePipeline,
		webAdapter,
	),
);

// Channel management routes — pairing codes and channel links
app.use(
	'/v1/channels',
	createChannelsRouter(
		authService,
		channelService,
		agentService,
		credentialService,
		telegramPollerManager,
		discordGatewayManager,
	),
);

// Webhook routes — public, HMAC-verified
app.use('/v1/webhooks', createWebhooksRouter(triggerService));

// Workflow routes — scoped under agents (GET/POST /v1/agents/:agentId/workflows/...)
// triggerService is passed so cron jobs are scheduled immediately on create/update/delete
// (WorkflowService manages trigger DB rows directly to avoid a circular dep, so it
// cannot call TriggerService itself — the route layer bridges that gap).
app.use(
	'/v1/agents/:agentId/workflows',
	createWorkflowsRouter(authService, workflowService, workflowRunService, triggerService),
);

// Global error handler — must be registered last, after all routes
app.use(errorHandler);

// Validate the execution driver before accepting traffic — a misconfigured
// docker driver (missing image, unreachable daemon) must fail the boot, not
// the first user message.
await runtimeService.init();

app.listen(PORT, async () => {
	logger.info({ port: PORT, runtimeDriver: executionDriver.name }, '[backend] server running');
	// Load and schedule all enabled cron triggers on startup
	await triggerService.loadAll();
	// Start Telegram long-polling for all active bot credentials
	await telegramPollerManager.loadActivePollers();
	// Start Discord Gateway connections for all active bot credentials
	await discordGatewayManager.loadActiveGateways();
});

// Kill all live agent runtimes on shutdown so containers/processes are not
// stranded across restarts (driver init() reaps any survivors as a backstop).
let shuttingDown = false;
const gracefulShutdown = (signal: string): void => {
	if (shuttingDown) return;
	shuttingDown = true;
	logger.info({ signal }, '[backend] shutting down');
	void runtimeService.shutdown().finally(() => process.exit(0));
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

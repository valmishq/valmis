import express from 'express';
import { corsMiddleware } from './middleware/cors.js';
import { rateLimiter } from './middleware/auth.js';
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
import { UserService } from './services/UserService.js';
import { AuthService } from './services/AuthService.js';

// --- Validate required environment variables at startup ---
const { JWT_SECRET, JWT_EXPIRES_IN } = process.env;
if (!JWT_SECRET || !JWT_EXPIRES_IN) {
	throw new Error('Missing required env vars: JWT_SECRET and JWT_EXPIRES_IN must be set');
}

// --- Instantiate shared services ---
const userService = new UserService();
const authService = new AuthService(userService, JWT_SECRET, JWT_EXPIRES_IN);

const app = express();
const PORT = process.env.BACKEND_PORT ?? 4000;

// Number of trusted reverse proxy hops in front of this app (e.g. 1 for nginx).
// Must be a number — express-rate-limit v8 rejects the boolean `true` because it
// allows clients to spoof X-Forwarded-For and bypass IP-based rate limiting.
// Use 0 for local dev (no proxy), 1 for a single nginx/load-balancer hop, etc.
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10));

// --- Global middleware ---
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiter — applied globally with public endpoint exclusions
app.use((req, res, next) => {
	const excluded = [
		/^\/v1\/auth\/status$/,
		/^\/v1\/auth\/setup$/,
		/^\/v1\/health$/,
		// OAuth2 callback must remain public — the provider redirects here without a token
		/^\/v1\/oauth2\/callback$/,
	];
	if (excluded.some((p) => p.test(req.path))) return next();
	return rateLimiter(req, res, next);
});

// --- v1 routes ---
app.use('/v1/health', healthRouter);
app.use('/v1/credentials', createCredentialsRouter(authService));
app.use('/v1/oauth2', createOAuth2Router(authService));
app.use('/v1/llm-providers', createLlmProvidersRouter(authService));
app.use('/v1/auth', createAuthRouter(authService));
app.use('/v1/users', createUsersRouter(authService));
app.use('/v1/api-keys', createApiKeysRouter(authService));
app.use('/v1/iam', createIamRouter(authService));
app.use('/v1/agents', createAgentsRouter(authService));
app.use('/v1/skills', createSkillsRouter(authService));

app.listen(PORT, () => {
	console.log(`[backend] Server running at http://localhost:${PORT}`);
});

export default app;

/**
 * PM2 process configuration for the combined app container.
 *
 * Runs two processes inside the single Docker container:
 *   - backend  : Express API on port 4000 (internal Docker network only)
 *   - frontend : SvelteKit Node.js server on port 3000 (public)
 *
 * PM2 runtime (pm2-runtime) keeps the container alive as long as at least
 * one process is running, and restarts crashed processes automatically.
 *
 * Environment variables are injected by Docker at runtime (env_file in
 * docker-compose.yml) — PM2 inherits the container's environment.
 */
module.exports = {
	apps: [
		{
			name: 'backend',
			script: 'node',
			args: 'apps/backend/dist/index.js',
			cwd: '/repo',
			// Inherit all env vars from the container environment
			merge_env: true,
			// Restart on crash but not on clean exit (exit_code 0)
			autorestart: true,
			// Log to stdout/stderr so Docker captures them via `docker logs`
			out_file: '/dev/stdout',
			error_file: '/dev/stderr',
			log_type: 'raw',
		},
		{
			name: 'frontend',
			script: 'node',
			args: 'apps/web/build/index.js',
			cwd: '/repo',
			merge_env: true,
			autorestart: true,
			out_file: '/dev/stdout',
			error_file: '/dev/stderr',
			log_type: 'raw',
			env: {
				// SvelteKit adapter-node reads PORT for the listening port
				PORT: '3000',
				// ORIGIN must match the public URL so SvelteKit's CSRF protection works
				// Override via ORIGIN env var in .env / docker-compose environment block
				ORIGIN: process.env.APP_URL || 'http://localhost:3000',
			},
		},
	],
};

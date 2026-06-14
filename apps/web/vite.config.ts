import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// Load env from the monorepo root (two levels up from apps/web)
	const env = loadEnv(mode, '../../', '');

	const backendPort = env.BACKEND_PORT ?? '4000';
	const frontendPort = parseInt(env.FRONTEND_PORT ?? '3000', 10);

	// Derive allowed dev-server hosts from APP_URL so tunnels (e.g. Cloudflare)
	// are accepted without hardcoding the hostname here.
	const allowedHosts: string[] = [];
	if (env.APP_URL) {
		try {
			allowedHosts.push(new URL(env.APP_URL).hostname);
		} catch {
			// ignore malformed APP_URL
		}
	}

	return {
		plugins: [tailwindcss(), sveltekit()],
		server: {
			port: frontendPort,
			allowedHosts,
			proxy: {
				// Proxy all /api/* requests to the backend during development.
				// e.g. fetch('/api/health') → http://localhost:<BACKEND_PORT>/health
				'/api': {
					target: `http://localhost:${backendPort}`,
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/api/, '')
				}
			}
		}
	};
});

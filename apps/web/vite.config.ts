import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// Load env from the monorepo root (two levels up from apps/web)
	const env = loadEnv(mode, '../../', '');

	const backendPort = env.BACKEND_PORT ?? '4000';
	const frontendPort = parseInt(env.FRONTEND_PORT ?? '3000', 10);

	return {
		plugins: [tailwindcss(), sveltekit()],
		server: {
			port: frontendPort,
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

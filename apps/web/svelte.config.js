import adapterNode from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// adapter-node produces a standalone Node.js server at apps/web/build/index.js.
		// Set PORT env var to control the listening port (default: 3000 via pm2.config.cjs).
		adapter: adapterNode(),
		alias: {
			'@/*': './src/lib/*'
		},
		// Resolve env vars from the monorepo root so that shared variables
		// (e.g. APP_URL) are available via $env/static/private.
		env: {
			dir: '../../'
		}
	}
};

export default config;

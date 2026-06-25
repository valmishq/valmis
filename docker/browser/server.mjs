// Valmis browser server — an Apache-2.0 replacement for the SSPL browserless image.
//
// Launches a long-lived Playwright server bound to all interfaces. The backend
// (BrowserService, container mode + BROWSER_CONNECT_MODE=ws) connects to it with
// `chromium.connect('ws://<container-ip>:<port>')` and drives one isolated
// BrowserContext per agent thread. The Playwright client (backend's
// `playwright-core`) and this server MUST be the same version — both are pinned
// to the version in this image's package.json and the base image tag.
import { chromium } from 'playwright-core';

const port = Number(process.env.PORT || 3000);

const server = await chromium.launchServer({
	host: '0.0.0.0',
	port,
	// Fixed ws path so the backend's pathless `ws://<ip>:<port>` endpoint connects
	// (the default would append a random guid the backend can't know).
	wsPath: '/',
	headless: true,
	args: [
		// The container itself is the isolation boundary (non-privileged, isolated
		// network); Chromium's own sandbox needs caps we deliberately drop.
		'--no-sandbox',
		// Avoid Chromium crashes on Docker's default 64 MB /dev/shm.
		'--disable-dev-shm-usage',
	],
});

console.log(`[valmis-browser] listening ${server.wsEndpoint()}`);

const shutdown = () => {
	server.close().finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

# ─── Valmis browser image ────────────────────────────────────────────────────
# Apache-2.0 headless-browser server, replacing the SSPL-licensed
# ghcr.io/browserless/chromium. Built FROM the official Playwright image (which
# bundles a matching Chromium under /ms-playwright) and runs a Playwright server
# the backend connects to (BROWSER_CONNECT_MODE=ws).
#
# Published to ghcr.io/valmishq/valmis-browser by .github/workflows/docker-publish.yml.
# Build from the REPO ROOT (CI uses context .):
#   docker build -f docker/browser/Dockerfile -t ghcr.io/valmishq/valmis-browser:latest .
#
# VERSION LOCK: the Playwright base-image tag below and the playwright-core dep in
# docker/browser/package.json MUST match the backend's playwright-core version
# (apps/backend/package.json) — `chromium.connect()` rejects a version mismatch.
# ──────────────────────────────────────────────────────────────────────────────

FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /app

# Install only the Playwright client (browsers are already in the base image at
# PLAYWRIGHT_BROWSERS_PATH=/ms-playwright; playwright-core never downloads them).
COPY docker/browser/package.json ./
RUN npm install --omit=dev

COPY docker/browser/server.mjs ./

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.mjs"]

# ─── Build stage ───────────────────────────────────────────────────────────────
# Builds the entire monorepo (frontend + backend + agent-runtime) from source.
#
# SvelteKit static env vars:
#   svelte.config.js sets kit.env.dir = '../../' so Vite reads .env from the repo
#   root at build time. We copy .env into the builder — it is NOT copied to the
#   final runner image. Adding new vars to .env/.env.example requires no changes
#   here.
#
# SvelteKit adapter:
#   svelte.config.js uses @sveltejs/adapter-node directly.
#   The build output is at apps/web/build/index.js (standalone Node.js server).
# ───────────────────────────────────────────────────────────────────────────────

FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

WORKDIR /repo

# Copy workspace manifests + lockfile first (better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/tsconfig/package.json   packages/tsconfig/
COPY packages/types/package.json      packages/types/
COPY packages/ui/package.json         packages/ui/
COPY packages/utils/package.json      packages/utils/
COPY packages/models/package.json     packages/models/
COPY apps/backend/package.json        apps/backend/
COPY apps/web/package.json            apps/web/
COPY apps/agent-runtime/package.json  apps/agent-runtime/

RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Copy .env so SvelteKit can read static private vars via kit.env.dir = '../../'
# This file stays in the builder stage only — never enters the runner image.
# Any new vars added to .env/.env.example are picked up automatically.
COPY .env .env

RUN pnpm build

# ─── Runtime stage ─────────────────────────────────────────────────────────────
# Lean production image — compiled outputs + production dependencies only.
# No Docker CLI required — with AGENT_RUNTIME_DRIVER=docker the backend talks
# to the Docker Engine API (via dockerode) through the docker-socket-proxy
# service to spawn one hardened sibling container per agent turn. With
# AGENT_RUNTIME_DRIVER=process, agent turns run as Node.js child processes.
# ───────────────────────────────────────────────────────────────────────────────

FROM node:22-slim AS runner

# Install pnpm and PM2.
# PM2 manages both the SvelteKit and Express processes inside this container.
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate \
    && npm install -g pm2@latest

WORKDIR /repo

# Copy workspace manifests for production dependency install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/tsconfig/package.json   packages/tsconfig/
COPY packages/types/package.json      packages/types/
COPY packages/ui/package.json         packages/ui/
COPY packages/utils/package.json      packages/utils/
COPY packages/models/package.json     packages/models/
COPY apps/backend/package.json        apps/backend/
COPY apps/web/package.json            apps/web/
COPY apps/agent-runtime/package.json  apps/agent-runtime/

RUN pnpm install --frozen-lockfile --prod

# Shared type declarations — consumed directly from source
COPY --from=builder /repo/packages/types/src   packages/types/src
COPY --from=builder /repo/packages/ui/src      packages/ui/src

# packages/models — pure static data, consumed directly from source
COPY --from=builder /repo/packages/models/src  packages/models/src

# packages/utils compiled JS output
COPY --from=builder /repo/packages/utils/dist  packages/utils/dist

# Data files referenced at runtime via __dirname (tsc does not copy non-TS files).
# registry.ts resolves: dist/integrations/definitions/ and dist/skills/<name>/SKILL.md
COPY --from=builder /repo/packages/utils/src/integrations/definitions  packages/utils/dist/integrations/definitions
COPY --from=builder /repo/packages/utils/src/skills                    packages/utils/dist/skills

# Backend compiled output (tsc → dist/)
COPY --from=builder /repo/apps/backend/dist    apps/backend/dist

# Drizzle migration files (needed for db:migrate at startup)
COPY --from=builder /repo/apps/backend/drizzle apps/backend/drizzle

# SvelteKit adapter-node output (vite build → build/)
# The build/ directory contains the standalone Node.js server entry at build/index.js
COPY --from=builder /repo/apps/web/build       apps/web/build

# Agent-runtime compiled output (tsc → dist/).
# Used only by the process driver (AGENT_RUNTIME_DRIVER=process) — the docker
# driver runs the separate logiclabshq/agent-runtime image instead (built from
# apps/agent-runtime/Dockerfile). AGENT_RUNTIME_ENTRY points to this path.
COPY --from=builder /repo/apps/agent-runtime/dist  apps/agent-runtime/dist

# PM2 process config — runs both processes under PM2's process manager
COPY pm2.config.cjs .

# Entrypoint: runs Drizzle migrations then starts PM2
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production

# Port 3000: SvelteKit frontend (published externally in docker-compose)
# Port 4000: Express backend (NOT published externally — only on Docker network)
EXPOSE 3000
EXPOSE 4000

CMD ["/bin/sh", "docker-entrypoint.sh"]

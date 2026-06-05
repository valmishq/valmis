#!/bin/sh
# Docker container entrypoint.
# 1. Runs Drizzle migrations via drizzle-orm's programmatic migrator
#    (no drizzle-kit or tsx required — drizzle-orm is a prod dependency).
# 2. Starts PM2 to manage the backend + frontend processes.
set -e

echo "[entrypoint] Running database migrations..."

# cd into apps/backend so Node resolves drizzle-orm from apps/backend/node_modules
(cd /repo/apps/backend && node --input-type=module <<'EOF'
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'node:path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[migrate] DATABASE_URL is not set');
  process.exit(1);
}

const migrationsFolder = path.resolve('/repo/apps/backend/drizzle');

console.log(`[migrate] Connecting to ${DATABASE_URL.replace(/:\/\/.*@/, '://<credentials>@')}...`);
const pool = new pg.Pool({ connectionString: DATABASE_URL });

// Enable pgvector extension — must exist before migration runs CREATE TABLE with vector columns
console.log('[migrate] Enabling pgvector extension...');
await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

const db = drizzle(pool);

console.log(`[migrate] Applying migrations from ${migrationsFolder}...`);
await migrate(db, { migrationsFolder });
await pool.end();
console.log('[migrate] Migrations complete.');
EOF
)

echo "[entrypoint] Starting application..."
exec pm2-runtime pm2.config.cjs

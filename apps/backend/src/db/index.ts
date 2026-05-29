import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

// Connection pool — configure via DATABASE_URL env var.
// Format: postgresql://user:password@host:port/dbname
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Drizzle instance — export this for use throughout the app.
export const db = drizzle(pool, { schema });

export type Db = typeof db;

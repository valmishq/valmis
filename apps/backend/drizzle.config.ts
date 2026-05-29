import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Path to your schema files — drizzle-kit reads these to generate migrations.
  schema: './src/db/schema/index.ts',

  // Output directory for generated migration SQL files.
  out: './drizzle',

  dialect: 'postgresql',

  dbCredentials: {
    // Set DATABASE_URL in your .env file.
    // Format: postgresql://user:password@host:port/dbname
    url: process.env.DATABASE_URL!,
  },

  // Print all SQL statements when running migrations.
  verbose: true,

  // Prompt for confirmation before running destructive migrations.
  strict: true,
});

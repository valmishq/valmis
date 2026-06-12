import {
	pgTable,
	uuid,
	varchar,
	text,
	boolean,
	jsonb,
	timestamp,
	index,
	unique,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * User-installed skills (Agent Skills open standard) fetched from GitHub.
 * Built-in skills live in packages/utils/src/skills/ and are NOT stored here.
 *
 * Provenance is pinned at install time: commitSha is the resolved 40-char
 * commit and contentHash is a SHA-256 over the canonical file bundle. The
 * materializer re-verifies contentHash against skill_files before every
 * workspace write — a mismatch means the stored content was tampered with
 * and the skill is skipped.
 */
export const skills = pgTable(
	'skills',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** Frontmatter name — authoritative skill identifier for this owner */
		name: varchar('name', { length: 64 }).notNull(),
		description: text('description').notNull(),
		/** Full parsed YAML frontmatter of the SKILL.md */
		frontmatter: jsonb('frontmatter').$type<Record<string, unknown>>().notNull(),
		evolvable: boolean('evolvable').notNull().default(false),
		/** The URL the user pasted at install time */
		sourceUrl: text('source_url').notNull(),
		/** "owner/repo" */
		sourceRepo: varchar('source_repo', { length: 255 }).notNull(),
		/** Branch/tag the user specified (null = repo default branch) */
		sourceRef: varchar('source_ref', { length: 255 }),
		/** Subdirectory within the repo containing the skill */
		sourceSubpath: text('source_subpath'),
		/** Resolved full 40-char commit SHA — the provenance pin */
		commitSha: varchar('commit_sha', { length: 40 }).notNull(),
		/** SHA-256 hex over the canonical bundle (files sorted by path) */
		contentHash: varchar('content_hash', { length: 64 }).notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	(table) => [
		unique('skills_owner_name_unique').on(table.ownerId, table.name),
		index('skills_owner_id_idx').on(table.ownerId),
	],
);

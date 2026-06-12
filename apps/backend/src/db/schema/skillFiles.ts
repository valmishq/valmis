import { pgTable, uuid, text, integer, index, unique } from 'drizzle-orm/pg-core';
import { skills } from './skills.js';

/**
 * File contents of an installed skill bundle (SKILL.md + references/scripts).
 * Text-only in v1 — binary files are rejected at install time. The backend
 * materializes these rows into <workspace>/skills/<name>/ before each spawn.
 */
export const skillFiles = pgTable(
	'skill_files',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		skillId: uuid('skill_id')
			.notNull()
			.references(() => skills.id, { onDelete: 'cascade' }),
		/** Bundle-relative path, e.g. "SKILL.md", "references/api.md" */
		path: text('path').notNull(),
		content: text('content').notNull(),
		/** Content size in bytes (UTF-8) */
		size: integer('size').notNull(),
	},
	(table) => [
		unique('skill_files_skill_path_unique').on(table.skillId, table.path),
		index('skill_files_skill_id_idx').on(table.skillId),
	],
);

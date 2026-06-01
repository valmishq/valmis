import {
	pgTable,
	uuid,
	varchar,
	text,
	integer,
	timestamp,
	index,
	unique,
} from 'drizzle-orm/pg-core';
import { agents } from './agents.js';

/**
 * Stores agent-specific evolved overrides for skill instructions.
 * When the evolution engine mutates a skill, the result is stored here.
 * At runtime, this record takes precedence over the codebase SKILL.md body.
 */
export const agentEvolvedSkills = pgTable(
	'agent_evolved_skills',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		agentId: uuid('agent_id')
			.notNull()
			.references(() => agents.id, { onDelete: 'cascade' }),
		/** Matches the directory name in packages/utils/src/skills/ */
		skillName: varchar('skill_name', { length: 255 }).notNull(),
		/** The optimized markdown instructions produced by the evolution engine */
		evolvedInstructions: text('evolved_instructions').notNull(),
		/** Increments on each evolution cycle for this agent+skill pair */
		version: integer('version').notNull().default(1),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	(table) => [
		index('agent_evolved_skills_agent_id_idx').on(table.agentId),
		/** Only one evolved record per agent+skill pair */
		unique('agent_evolved_skills_agent_skill_unique').on(table.agentId, table.skillName),
	],
);

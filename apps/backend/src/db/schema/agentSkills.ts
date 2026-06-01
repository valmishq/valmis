import { pgTable, uuid, varchar, primaryKey, index } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';

/** Junction table — maps which skills are assigned to each agent */
export const agentSkills = pgTable(
	'agent_skills',
	{
		agentId: uuid('agent_id')
			.notNull()
			.references(() => agents.id, { onDelete: 'cascade' }),
		/** Matches the directory name in packages/utils/src/skills/ */
		skillName: varchar('skill_name', { length: 255 }).notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.agentId, table.skillName] }),
		index('agent_skills_agent_id_idx').on(table.agentId),
	],
);

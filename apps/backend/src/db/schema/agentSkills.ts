import { pgTable, uuid, varchar, primaryKey, index } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import { skills } from './skills.js';

/** Junction table — maps which skills are assigned to each agent */
export const agentSkills = pgTable(
	'agent_skills',
	{
		agentId: uuid('agent_id')
			.notNull()
			.references(() => agents.id, { onDelete: 'cascade' }),
		/**
		 * Builtin: matches the directory name in packages/utils/src/skills/.
		 * Installed: matches skills.name for the agent owner's installed skill.
		 */
		skillName: varchar('skill_name', { length: 255 }).notNull(),
		/** 'builtin' | 'installed' — where the skill content is resolved from */
		source: varchar('source', { length: 16 }).notNull().default('builtin'),
		/**
		 * Set for installed skills only. ON DELETE CASCADE — uninstalling a
		 * skill automatically unassigns it from every agent.
		 */
		skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'cascade' }),
	},
	(table) => [
		primaryKey({ columns: [table.agentId, table.skillName] }),
		index('agent_skills_agent_id_idx').on(table.agentId),
	],
);

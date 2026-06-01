import { pgTable, uuid, primaryKey, index } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import { credentials } from './credentials.js';

/** Junction table — maps which credentials each agent has access to */
export const agentCredentials = pgTable(
	'agent_credentials',
	{
		agentId: uuid('agent_id')
			.notNull()
			.references(() => agents.id, { onDelete: 'cascade' }),
		credentialId: uuid('credential_id')
			.notNull()
			.references(() => credentials.id, { onDelete: 'cascade' }),
	},
	(table) => [
		primaryKey({ columns: [table.agentId, table.credentialId] }),
		index('agent_credentials_agent_id_idx').on(table.agentId),
	],
);

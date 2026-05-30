import { pgTable, uuid, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { roles } from './roles.js';

/** user_roles join table — many-to-many between users and roles */
export const userRoles = pgTable(
	'user_roles',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		roleId: uuid('role_id')
			.notNull()
			.references(() => roles.id, { onDelete: 'cascade' }),
	},
	(table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

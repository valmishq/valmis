import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { roles, userRoles, users } from '../db/schema/index.js';
import { createAbilityFor, type AppAbility } from '../iam-policy/ability.js';
import type { Role, CaslPolicy } from '@repo/types';

/**
 * Service responsible for role management and CASL ability construction.
 */
export class IamService {
	/** Return all roles. */
	async getRoles(): Promise<Role[]> {
		const rows = await db.select().from(roles);
		return rows.map(this.#mapRole);
	}

	/** Return a single role by ID, or null if not found. */
	async getRoleById(id: string): Promise<Role | null> {
		const rows = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
		return rows[0] ? this.#mapRole(rows[0]) : null;
	}

	/** Create a new role. */
	async createRole(name: string, policies: CaslPolicy[], slug?: string): Promise<Role> {
		const [inserted] = await db
			.insert(roles)
			.values({ name, slug: slug ?? null, policies })
			.returning();
		return this.#mapRole(inserted);
	}

	/** Partially update a role's name and/or policies. */
	async updateRole(
		id: string,
		updates: { name?: string; policies?: CaslPolicy[] },
	): Promise<Role | null> {
		const existing = await this.getRoleById(id);
		if (!existing) return null;

		const [updated] = await db
			.update(roles)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(roles.id, id))
			.returning();

		return this.#mapRole(updated);
	}

	/** Hard-delete a role by ID. */
	async deleteRole(id: string): Promise<boolean> {
		const result = await db.delete(roles).where(eq(roles.id, id));
		return (result.rowCount ?? 0) > 0;
	}

	/** Return all roles assigned to a user. */
	async getRolesForUser(userId: string): Promise<Role[]> {
		const rows = await db
			.select({
				id: roles.id,
				name: roles.name,
				slug: roles.slug,
				policies: roles.policies,
				createdAt: roles.createdAt,
				updatedAt: roles.updatedAt,
			})
			.from(userRoles)
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(eq(userRoles.userId, userId));

		return rows.map(this.#mapRole);
	}

	/**
	 * Build a CASL ability for a user.
	 * Loads the user's roles, flattens all policies, interpolates ${user.id}
	 * template variables, and returns a MongoAbility instance.
	 */
	async getAbilityForUser(userId: string): Promise<AppAbility> {
		const userRolesList = await this.getRolesForUser(userId);

		// Fetch actual user row to get the id for template interpolation
		const userRow = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		const id = userRow[0]?.id ?? userId;

		// Flatten all policies from all roles and interpolate ${user.id}
		const flatPolicies = userRolesList.flatMap((r) => r.policies);
		const interpolated = JSON.parse(
			JSON.stringify(flatPolicies).replace(/\$\{user\.id\}/g, id),
		) as CaslPolicy[];

		return createAbilityFor(interpolated);
	}

	/** Map a raw DB row to the Role type. */
	#mapRole(row: {
		id: string;
		name: string;
		slug: string | null;
		policies: CaslPolicy[];
		createdAt: Date;
		updatedAt: Date;
	}): Role {
		return {
			id: row.id,
			name: row.name,
			slug: row.slug,
			policies: row.policies ?? [],
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}
}

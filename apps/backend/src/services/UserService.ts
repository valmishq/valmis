import bcrypt from 'bcrypt';
import { eq, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, roles, userRoles } from '../db/schema/index.js';
import type { User, Role } from '@repo/types';

const BCRYPT_COST = 10;

/** Raw DB row including password hash — used internally for login only */
export interface UserWithPassword {
	id: string;
	email: string;
	first_name: string | null;
	last_name: string | null;
	password: string | null;
	provider: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface CreateUserDetails {
	email: string;
	first_name?: string;
	last_name?: string;
	password?: string;
}

export interface UpdateUserDetails {
	email?: string;
	first_name?: string;
	last_name?: string;
}

/**
 * Service responsible for all user CRUD operations.
 * Methods that mutate data accept actor/ip parameters for audit logging.
 */
export class UserService {
	/**
	 * Find a user by email, returning the raw DB row including the password hash.
	 * Used only during login — never expose the password hash to HTTP responses.
	 */
	async findByEmail(email: string): Promise<UserWithPassword | null> {
		const rows = await db
			.select({
				id: users.id,
				email: users.email,
				first_name: users.first_name,
				last_name: users.last_name,
				password: users.password,
				provider: users.provider,
				createdAt: users.createdAt,
				updatedAt: users.updatedAt,
			})
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		return rows[0] ?? null;
	}

	/**
	 * Find a user by ID with their first assigned role populated.
	 * Never returns the password hash.
	 */
	async findById(id: string): Promise<User | null> {
		const rows = await db
			.select({
				id: users.id,
				email: users.email,
				first_name: users.first_name,
				last_name: users.last_name,
				createdAt: users.createdAt,
				roleId: roles.id,
				roleName: roles.name,
				roleSlug: roles.slug,
				rolePolicies: roles.policies,
				roleCreatedAt: roles.createdAt,
				roleUpdatedAt: roles.updatedAt,
			})
			.from(users)
			.leftJoin(userRoles, eq(userRoles.userId, users.id))
			.leftJoin(roles, eq(roles.id, userRoles.roleId))
			.where(eq(users.id, id))
			.limit(1);

		if (!rows[0]) return null;

		const row = rows[0];
		const role: Role | null = row.roleId
			? {
					id: row.roleId,
					name: row.roleName!,
					slug: row.roleSlug,
					policies: row.rolePolicies ?? [],
					createdAt: row.roleCreatedAt!,
					updatedAt: row.roleUpdatedAt!,
				}
			: null;

		return {
			id: row.id,
			email: row.email,
			first_name: row.first_name,
			last_name: row.last_name,
			role,
			createdAt: row.createdAt,
		};
	}

	/** Return all users with their first assigned role populated. */
	async findAll(): Promise<User[]> {
		const rows = await db
			.select({
				id: users.id,
				email: users.email,
				first_name: users.first_name,
				last_name: users.last_name,
				createdAt: users.createdAt,
				roleId: roles.id,
				roleName: roles.name,
				roleSlug: roles.slug,
				rolePolicies: roles.policies,
				roleCreatedAt: roles.createdAt,
				roleUpdatedAt: roles.updatedAt,
			})
			.from(users)
			.leftJoin(userRoles, eq(userRoles.userId, users.id))
			.leftJoin(roles, eq(roles.id, userRoles.roleId));

		return rows.map((row) => {
			const role: Role | null = row.roleId
				? {
						id: row.roleId,
						name: row.roleName!,
						slug: row.roleSlug,
						policies: row.rolePolicies ?? [],
						createdAt: row.roleCreatedAt!,
						updatedAt: row.roleUpdatedAt!,
					}
				: null;

			return {
				id: row.id,
				email: row.email,
				first_name: row.first_name,
				last_name: row.last_name,
				role,
				createdAt: row.createdAt,
			};
		});
	}

	/**
	 * Create a new user with a bcrypt-hashed password and assign a role.
	 * actor/ip are used for audit logging.
	 */
	async createUser(
		details: CreateUserDetails,
		roleId: string,
		_actor: string,
		_ip: string,
	): Promise<User> {
		const hashedPassword = details.password
			? await bcrypt.hash(details.password, BCRYPT_COST)
			: null;

		const now = new Date();
		const [inserted] = await db
			.insert(users)
			.values({
				email: details.email,
				first_name: details.first_name ?? null,
				last_name: details.last_name ?? null,
				password: hashedPassword,
				createdAt: now,
				updatedAt: now,
			})
			.returning({ id: users.id });

		await db.insert(userRoles).values({ userId: inserted.id, roleId });

		console.info(`[audit] CREATE user id=${inserted.id} actor=${_actor} ip=${_ip}`);

		return (await this.findById(inserted.id))!;
	}

	/**
	 * Update user fields. If roleId changed, the old user_roles entry is
	 * replaced with the new one.
	 */
	async updateUser(
		id: string,
		details: UpdateUserDetails,
		roleId: string | undefined,
		_actor: string,
		_ip: string,
	): Promise<User | null> {
		const existing = await this.findById(id);
		if (!existing) return null;

		if (Object.keys(details).length > 0) {
			await db
				.update(users)
				.set({ ...details, updatedAt: new Date() })
				.where(eq(users.id, id));
		}

		if (roleId && existing.role?.id !== roleId) {
			await db.delete(userRoles).where(eq(userRoles.userId, id));
			await db.insert(userRoles).values({ userId: id, roleId });
		}

		console.info(`[audit] UPDATE user id=${id} actor=${_actor} ip=${_ip}`);
		return this.findById(id);
	}

	/**
	 * Hard-delete a user by ID.
	 * Guards against deleting the last remaining user to prevent full lockout.
	 */
	async deleteUser(id: string, _actor: string, _ip: string): Promise<{ error?: string }> {
		const [{ value: userCount }] = await db.select({ value: count() }).from(users);

		if (userCount <= 1) {
			return { error: 'Cannot delete the last user' };
		}

		await db.delete(users).where(eq(users.id, id));
		console.info(`[audit] DELETE user id=${id} actor=${_actor} ip=${_ip}`);
		return {};
	}

	/**
	 * Update a user's password after verifying the current one via bcrypt.
	 * Returns false if currentPassword does not match the stored hash.
	 */
	async updatePassword(
		id: string,
		currentPassword: string,
		newPassword: string,
		_actor: string,
		_ip: string,
	): Promise<boolean> {
		const rows = await db
			.select({ password: users.password })
			.from(users)
			.where(eq(users.id, id))
			.limit(1);

		const hash = rows[0]?.password;
		if (!hash) return false;

		const valid = await bcrypt.compare(currentPassword, hash);
		if (!valid) return false;

		const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
		await db
			.update(users)
			.set({ password: newHash, updatedAt: new Date() })
			.where(eq(users.id, id));

		console.info(`[audit] UPDATE user id=${id} field=password actor=${_actor} ip=${_ip}`);
		return true;
	}

	/**
	 * Bootstrap operation: create the first admin user with a "Super Admin" role.
	 * Only executes when the users table is empty. Returns null if users already exist.
	 */
	async createAdminUser(details: CreateUserDetails): Promise<User | null> {
		const [{ value: userCount }] = await db.select({ value: count() }).from(users);
		if (userCount > 0) return null;

		// Upsert the predefined Super Admin role
		let superAdminRole = await db
			.select()
			.from(roles)
			.where(eq(roles.slug, 'predefined_super_admin'))
			.limit(1)
			.then((r) => r[0] ?? null);

		if (!superAdminRole) {
			const [inserted] = await db
				.insert(roles)
				.values({
					name: 'Super Admin',
					slug: 'predefined_super_admin',
					policies: [{ action: 'manage', subject: 'all' }],
				})
				.returning();
			superAdminRole = inserted;
		}

		const user = await this.createUser(details, superAdminRole.id, 'system', 'setup');
		console.info(`[audit] SETUP admin user id=${user.id}`);
		return user;
	}
}

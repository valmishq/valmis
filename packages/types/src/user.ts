import type { CaslPolicy } from './iam.js';

/** A role with its CASL policies */
export interface Role {
	id: string;
	slug: string | null;
	name: string;
	policies: CaslPolicy[];
	createdAt: Date;
	updatedAt: Date;
}

/** Authenticated user with their first role populated */
export interface User {
	id: string;
	first_name: string | null;
	last_name: string | null;
	email: string;
	role: Role | null;
	createdAt: Date;
}

/**
 * An API key record as returned to the client.
 * The key field is masked on list responses: first 5 chars + '*****'.
 * Only the full raw key is returned at creation time.
 */
export interface ApiKey {
	id: string;
	name: string;
	key: string;
	expiresAt: string;
	createdAt: string;
}

// ─── Request Bodies ───────────────────────────────────────────────────────────

/** PATCH /v1/users/profile — update own profile fields (name only; email has its own route) */
export interface UpdateProfileRequestBody {
	first_name?: string;
	last_name?: string;
}

/** POST /v1/users/profile/password — change own password */
export interface ChangePasswordRequestBody {
	currentPassword: string;
	newPassword: string;
}

/** POST /v1/users/profile/email — change own email (current password required) */
export interface ChangeEmailRequestBody {
	newEmail: string;
	currentPassword: string;
}

/** POST /v1/users — create a new user (admin) */
export interface CreateUserRequestBody {
	email: string;
	password: string;
	roleId: string;
	first_name?: string;
	last_name?: string;
}

/** PUT /v1/users/:id — update a user (admin) */
export interface UpdateUserRequestBody {
	email?: string;
	first_name?: string;
	last_name?: string;
	roleId?: string;
}

/** POST /v1/api-keys — generate a new API key */
export interface CreateApiKeyRequestBody {
	name: string;
	expiresInDays: number;
}

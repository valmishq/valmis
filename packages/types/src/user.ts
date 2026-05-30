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

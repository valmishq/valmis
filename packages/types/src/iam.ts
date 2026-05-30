/** Actions that can be granted or denied in CASL policies */
export type AppActions = 'manage' | 'create' | 'read' | 'update' | 'delete' | 'search' | 'export';

/** Subjects (resource types) that policies can target */
export type AppSubjects = 'users' | 'roles' | 'settings' | 'dashboard' | 'all';

/**
 * A CASL policy rule stored in the database.
 * Conditions use MongoDB query syntax, supported by CASL's ucast library.
 * `inverted: true` means this is a Deny rule.
 */
export interface CaslPolicy {
	action: AppActions | AppActions[];
	subject: AppSubjects | AppSubjects[];
	conditions?: Record<string, unknown>;
	fields?: string[];
	inverted?: boolean;
	reason?: string;
}

// ─── Request Bodies ───────────────────────────────────────────────────────────

/** POST /v1/iam/roles — create a new role */
export interface CreateRoleRequestBody {
	name: string;
	policies: CaslPolicy[];
	slug?: string;
}

/** PUT /v1/iam/roles/:id — update an existing role */
export interface UpdateRoleRequestBody {
	name?: string;
	policies?: CaslPolicy[];
}

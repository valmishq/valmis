// ─── Email validation & normalization ─────────────────────────────────────────
// Pure helpers (no Node dependencies) shared across the backend. The web client
// keeps a parallel copy of EMAIL_REGEX because @repo/utils resolves its runtime
// entry to ./dist and is Node-only — see apps/web/.../profile/+page.svelte.

/** Canonical email format check (single source of truth for the server). */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Canonical email normalization for storage and comparison: trim surrounding
 * whitespace and lowercase. Apply on every write AND every lookup so uniqueness
 * is enforced consistently — the DB unique index on users.email is case-sensitive.
 */
export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

/** True when the email matches the canonical format (whitespace-tolerant). */
export function isValidEmail(email: string): boolean {
	return EMAIL_REGEX.test(email.trim());
}

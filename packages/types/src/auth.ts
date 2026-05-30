import type { JWTPayload } from 'jose';
import type { User } from './user.js';

/** Payload structure encoded into every JWT */
export interface AuthTokenPayload extends JWTPayload {
	email: string;
	roles: string[];
}

export interface LoginResponse {
	accessToken: string;
	user: Omit<User, 'password'>;
}

/** null means invalid credentials */
export type LoginResult = LoginResponse | null;

// ─── Request Bodies ───────────────────────────────────────────────────────────

/** POST /v1/auth/setup — create the first admin user */
export interface SetupRequestBody {
	email: string;
	password: string;
	first_name?: string;
	last_name?: string;
}

/** POST /v1/auth/login */
export interface LoginRequestBody {
	email: string;
	password: string;
}

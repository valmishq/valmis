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

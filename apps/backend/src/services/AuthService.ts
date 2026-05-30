import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify } from 'jose';
import type { UserService } from './UserService.js';
import type { AuthTokenPayload, LoginResult } from '@repo/types';

/**
 * Service responsible for JWT issuance and credential verification.
 * Injected with UserService and JWT configuration at construction time.
 */
export class AuthService {
	readonly #userService: UserService;
	readonly #jwtSecret: Uint8Array;
	readonly #jwtExpiresIn: string;

	constructor(userService: UserService, jwtSecret: string, jwtExpiresIn: string) {
		this.#userService = userService;
		this.#jwtSecret = new TextEncoder().encode(jwtSecret);
		this.#jwtExpiresIn = jwtExpiresIn;
	}

	/**
	 * Authenticate a user by email/password.
	 * Returns null if credentials are invalid.
	 */
	async login(email: string, password: string, ip: string): Promise<LoginResult> {
		const dbUser = await this.#userService.findByEmail(email);

		if (!dbUser) {
			console.info(`[audit] LOGIN_FAIL error=UserNotFound email=${email} ip=${ip}`);
			return null;
		}

		if (!dbUser.password) {
			console.info(`[audit] LOGIN_FAIL error=NoPassword email=${email} ip=${ip}`);
			return null;
		}

		const valid = await bcrypt.compare(password, dbUser.password);
		if (!valid) {
			console.info(`[audit] LOGIN_FAIL error=InvalidPassword email=${email} ip=${ip}`);
			return null;
		}

		// Load the public-safe user with their role
		const user = await this.#userService.findById(dbUser.id);
		if (!user) return null;

		const roles = user.role ? [user.role.name] : [];
		const payload: AuthTokenPayload = {
			sub: user.id,
			email: user.email,
			roles,
		};

		const accessToken = await this.#generateAccessToken(payload);
		console.info(`[audit] LOGIN_SUCCESS userId=${user.id} ip=${ip}`);

		return { accessToken, user };
	}

	/**
	 * Verify a JWT and return its decoded payload.
	 * Returns null on any error (expired, invalid signature, malformed).
	 */
	async verifyToken(token: string): Promise<AuthTokenPayload | null> {
		try {
			const { payload } = await jwtVerify(token, this.#jwtSecret);
			return payload as AuthTokenPayload;
		} catch (err) {
			console.error('[AuthService] jwtVerify failed:', err);
			return null;
		}
	}

	/** Sign a JWT with HS256 and the configured expiry. */
	async #generateAccessToken(payload: AuthTokenPayload): Promise<string> {
		return new SignJWT(payload as Record<string, unknown>)
			.setProtectedHeader({ alg: 'HS256' })
			.setIssuedAt()
			.setSubject(payload.sub!)
			.setExpirationTime(this.#jwtExpiresIn)
			.sign(this.#jwtSecret);
	}
}

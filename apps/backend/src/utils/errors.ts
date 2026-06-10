/**
 * Application error utilities.
 * Provides clean error classes that prevent sensitive information leakage.
 */

/**
 * Base class for HTTP errors with clean messages.
 * These errors are safe to expose to clients.
 */
export class HttpError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
		this.name = 'HttpError';
	}
}

/**
 * 400 Bad Request
 */
export class BadRequestError extends HttpError {
	constructor(message = 'Bad request') {
		super(400, message);
		this.name = 'BadRequestError';
	}
}

/**
 * 401 Unauthorized
 */
export class UnauthorizedError extends HttpError {
	constructor(message = 'Unauthorized') {
		super(401, message);
		this.name = 'UnauthorizedError';
	}
}

/**
 * 403 Forbidden
 */
export class ForbiddenError extends HttpError {
	constructor(message = 'Forbidden') {
		super(403, message);
		this.name = 'ForbiddenError';
	}
}

/**
 * 404 Not Found
 */
export class NotFoundError extends HttpError {
	constructor(message = 'Not found') {
		super(404, message);
		this.name = 'NotFoundError';
	}
}

/**
 * 409 Conflict
 */
export class ConflictError extends HttpError {
	constructor(message = 'Conflict') {
		super(409, message);
		this.name = 'ConflictError';
	}
}

/**
 * 429 Too Many Requests
 */
export class TooManyRequestsError extends HttpError {
	constructor(message = 'Too many requests') {
		super(429, message);
		this.name = 'TooManyRequestsError';
	}
}

/**
 * 500 Internal Server Error
 */
export class InternalServerError extends HttpError {
	constructor(message = 'Internal server error') {
		super(500, message);
		this.name = 'InternalServerError';
	}
}

/**
 * Wraps database operations to catch and sanitize errors.
 * Database errors often contain sensitive information (queries, params, schema details).
 * This function catches them and throws a clean HttpError instead.
 */
export async function wrapDbOperation<T>(
	operation: () => Promise<T>,
	errorMessage = 'Database operation failed',
): Promise<T> {
	try {
		return await operation();
	} catch (err) {
		// If it's already an HttpError, rethrow it as-is
		if (err instanceof HttpError) {
			throw err;
		}
		// Otherwise, wrap it in an InternalServerError with a clean message
		throw new InternalServerError(errorMessage);
	}
}

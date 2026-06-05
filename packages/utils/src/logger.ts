import pino from 'pino';

/**
 * Shared pino logger for all Node.js apps in the monorepo.
 *
 * Log level is controlled by the LOG_LEVEL env var (default: 'info').
 * In production (NODE_ENV=production) pino-pretty transport is skipped for
 * structured JSON output. In development pino-pretty colorises the output.
 */
export const logger = pino({
	level: process.env.LOG_LEVEL || 'info',
	redact: ['password', 'apiKey', 'token'],
	...(process.env.NODE_ENV !== 'production'
		? {
				transport: {
					target: 'pino-pretty',
					options: { colorize: true },
				},
			}
		: {}),
});

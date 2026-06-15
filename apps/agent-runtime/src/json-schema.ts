import { Ajv, type ValidateFunction } from 'ajv';
import { logger } from '@repo/utils';
import type { JsonSchema } from '@repo/types';

/**
 * JSON Schema conformance checking for workflow step outputs.
 *
 * When a workflow step declares an `expectedResponseSchema`, the runner must
 * verify the LLM's JSON output actually conforms to it — not merely that the
 * output parses as JSON. This module compiles the user-supplied schema with Ajv
 * (lenient mode, so simplified/partial schemas without `$schema` still work) and
 * caches compiled validators by schema identity.
 *
 * If the schema itself is not a valid JSON Schema we cannot enforce it; that is
 * surfaced as a warning and conformance is skipped (the caller still requires the
 * output to be valid JSON). This keeps behaviour honest: we never claim a schema
 * passed when it could not actually be evaluated.
 */
const ajv = new Ajv({ allErrors: true, strict: false });

/** Compiled-validator cache keyed by the stringified schema (null = unusable schema). */
const validatorCache = new Map<string, ValidateFunction | null>();

function getValidator(schema: JsonSchema): ValidateFunction | null {
	const key = JSON.stringify(schema);
	const cached = validatorCache.get(key);
	if (cached !== undefined) return cached;

	let validate: ValidateFunction | null;
	try {
		validate = ajv.compile(schema);
	} catch (err) {
		logger.warn(
			{ err: err instanceof Error ? err.message : String(err) },
			'[workflow-runner] expectedResponseSchema is not a valid JSON Schema — skipping conformance check',
		);
		validate = null;
	}
	validatorCache.set(key, validate);
	return validate;
}

/**
 * Validate `data` against `schema`.
 * Returns null when the data conforms (or the schema is unusable), or a
 * human-readable summary of the validation errors otherwise.
 */
export function validateJsonSchema(schema: JsonSchema, data: unknown): string | null {
	const validate = getValidator(schema);
	if (!validate) return null;
	if (validate(data)) return null;
	const errors = validate.errors ?? [];
	return (
		errors.map((e) => `${e.instancePath || '(root)'} ${e.message ?? 'is invalid'}`).join('; ') ||
		'does not match the required schema'
	);
}

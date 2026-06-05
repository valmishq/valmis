import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import type { CredentialDefinition } from '@repo/types';
import { credentialDefinitionSchema } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the definitions directory relative to the package root (packages/utils/).
// Go up 2 levels from src/integrations/ (or dist/integrations/) to reach packages/utils/,
// then descend into src/integrations/definitions/ where the YAML files live.
// tsc does not copy .yaml files, so we always point at the src/ tree regardless of
// whether the compiled dist/ or the source src/ version of this file is running.
const DEFINITIONS_DIR = path.resolve(__dirname, '../../src/integrations/definitions');

/** In-memory cache of all parsed and validated credential definitions */
let definitionsCache: CredentialDefinition[] | null = null;

/**
 * Loads all YAML credential definitions from the definitions/ directory.
 * Validates each file against the Zod schema. Results are cached after first load.
 */
export function loadCredentialDefinitions(): CredentialDefinition[] {
	if (definitionsCache) {
		return definitionsCache;
	}

	const files = fs.readdirSync(DEFINITIONS_DIR).filter((f) => f.endsWith('.yaml'));

	const definitions: CredentialDefinition[] = [];

	for (const file of files) {
		const filePath = path.join(DEFINITIONS_DIR, file);
		const content = fs.readFileSync(filePath, 'utf-8');
		const parsed = yaml.load(content);

		const result = credentialDefinitionSchema.safeParse(parsed);
		if (!result.success) {
			console.error(`[registry] Invalid credential definition in ${file}:`, result.error.format());
			continue;
		}

		definitions.push(result.data as CredentialDefinition);
	}

	definitionsCache = definitions;
	return definitions;
}

/**
 * Returns a single credential definition by its unique id.
 */
export function getCredentialDefinition(id: string): CredentialDefinition | undefined {
	const definitions = loadCredentialDefinitions();
	return definitions.find((def) => def.id === id);
}

/**
 * Clears the cached definitions. Useful for testing or hot-reloading.
 */
export function clearDefinitionsCache(): void {
	definitionsCache = null;
}

import type {
	LlmCatalogModel,
	LlmCatalogProvider,
	LlmModality,
	ModelsDevModel,
	ModelsDevResponse,
} from '@repo/types';
import { SUPPLEMENTAL_MODELS } from './supplements.js';

/** Upstream catalog endpoint. Open-source, community-maintained (used by opencode/SST). */
export const MODELS_DEV_API_URL = 'https://models.dev/api.json';

/**
 * Map a models.dev modality string onto our `LlmModality` union.
 * models.dev uses "pdf" where we use "file"; unknown values are dropped.
 */
function mapModality(m: string): LlmModality | null {
	switch (m) {
		case 'text':
			return 'text';
		case 'image':
			return 'image';
		case 'audio':
			return 'audio';
		case 'video':
			return 'video';
		case 'pdf':
		case 'file':
			return 'file';
		case 'embedding':
		case 'embeddings':
			return 'embeddings';
		default:
			return null;
	}
}

function mapModalities(list: string[] | undefined): LlmModality[] {
	if (!list) return [];
	const out: LlmModality[] = [];
	for (const m of list) {
		const mapped = mapModality(m);
		if (mapped && !out.includes(mapped)) out.push(mapped);
	}
	return out;
}

/**
 * Convert a per-MILLION-token USD price (models.dev) into the catalog's
 * per-token string contract (consumed by resolveAgentModel, which multiplies
 * back by 1e6). Returns undefined when the price is absent so optional pricing
 * fields stay omitted rather than "0".
 */
function perToken(perMillion: number | undefined): string | undefined {
	if (perMillion === undefined || perMillion === null || Number.isNaN(perMillion)) return undefined;
	// Avoid exponential notation in the generated file for readability while
	// keeping full precision (parseFloat in resolveAgentModel handles either form).
	const v = perMillion / 1_000_000;
	return v.toFixed(20).replace(/0+$/, '').replace(/\.$/, '') || '0';
}

/** A model is an embedding model when its family/id signals "embed". */
function isEmbedding(key: string, model: ModelsDevModel): boolean {
	const family = (model.family ?? '').toLowerCase();
	return family.includes('embed') || key.toLowerCase().includes('embed');
}

/** Transform one models.dev model entry into a catalog model. */
function transformModel(
	providerId: string,
	key: string,
	model: ModelsDevModel,
): LlmCatalogModel {
	const inputModalities = mapModalities(model.modalities?.input);
	const outputModalities = mapModalities(model.modalities?.output);
	const contextLength = model.limit?.context ?? 0;

	return {
		id: model.id || key,
		providerId,
		name: model.name || model.id || key,
		isEmbeddingModel: isEmbedding(key, model),
		contextLength,
		reasoning: model.reasoning ?? false,
		architecture: {
			modality: `${inputModalities.join('+') || 'text'}->${outputModalities.join('+') || 'text'}`,
			inputModalities: inputModalities.length ? inputModalities : ['text'],
			outputModalities: outputModalities.length ? outputModalities : ['text'],
			tokenizer: null,
			instructType: null,
		},
		pricing: {
			promptPerToken: perToken(model.cost?.input) ?? '0',
			completionPerToken: perToken(model.cost?.output) ?? '0',
			...(perToken(model.cost?.cache_read) !== undefined && {
				cacheReadPerToken: perToken(model.cost?.cache_read),
			}),
			...(perToken(model.cost?.cache_write) !== undefined && {
				cacheWritePerToken: perToken(model.cost?.cache_write),
			}),
		},
		topProvider: {
			contextLength: contextLength || null,
			maxCompletionTokens: model.limit?.output ?? null,
			isModerated: false,
		},
		knowledgeCutoff: model.knowledge ?? null,
	};
}

/**
 * Pure transform from the raw models.dev response into our catalog model list,
 * filtered to the curated provider allowlist. Shared by the build-time sync
 * script and the backend live-overlay so the mapping has a single source of truth.
 *
 * Output is deterministically sorted by (providerId, id) for clean generated diffs.
 */
export function transformModelsDev(
	raw: ModelsDevResponse,
	allowlist: LlmCatalogProvider[],
): LlmCatalogModel[] {
	const allowedIds = new Set(allowlist.map((p) => p.id));
	// Providers that are selectable but contribute no catalog models (the UI falls
	// back to a manual model-id input) — keeps the generated catalog small.
	const manualOnly = new Set(allowlist.filter((p) => p.manualModelOnly).map((p) => p.id));
	const out: LlmCatalogModel[] = [];

	for (const [providerId, provider] of Object.entries(raw)) {
		if (!allowedIds.has(providerId)) continue;
		if (manualOnly.has(providerId)) continue;
		if (!provider?.models) continue;
		for (const [key, model] of Object.entries(provider.models)) {
			out.push(transformModel(providerId, key, model));
		}
	}

	// Merge curated supplements for important models models.dev omits. Only fills
	// gaps (upstream wins on a (providerId, id) collision) and respects the allowlist.
	const present = new Set(out.map((m) => `${m.providerId}/${m.id}`));
	for (const m of SUPPLEMENTAL_MODELS) {
		if (!allowedIds.has(m.providerId) || manualOnly.has(m.providerId)) continue;
		if (present.has(`${m.providerId}/${m.id}`)) continue;
		out.push(m);
	}

	out.sort((a, b) => a.providerId.localeCompare(b.providerId) || a.id.localeCompare(b.id));
	return out;
}

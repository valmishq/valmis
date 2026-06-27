import type { LlmCatalogModel, LlmCatalogProvider, ModelsDevResponse } from '@repo/types';
import {
	LLM_MODELS,
	LLM_PROVIDERS,
	MODELS_DEV_API_URL,
	transformModelsDev,
} from '@repo/models';
import { logger } from '../../config/logger.js';

/**
 * Hybrid model catalog (module singleton).
 *
 * The generated baseline from `@repo/models` (offline-safe) is served immediately;
 * a daily live refresh overlays the latest models.dev data on top. The same pure
 * `transformModelsDev` used by the build-time sync script is reused here, so the
 * mapping has a single source of truth.
 *
 * Refresh NEVER throws — on any failure it logs a warning and keeps the current
 * in-memory catalog (the baseline at worst), so a models.dev outage can never
 * break model resolution or the providers page.
 */

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const FETCH_TIMEOUT_MS = 10_000;

// Curated providers are static (hand-maintained allowlist); only the model list
// is refreshed from upstream.
const PROVIDERS: LlmCatalogProvider[] = LLM_PROVIDERS;
let MODELS: LlmCatalogModel[] = LLM_MODELS;
let lastRefreshedAt: string | null = null;

/** Current curated provider allowlist. */
export function getCatalogProviders(): LlmCatalogProvider[] {
	return PROVIDERS;
}

/** Current model catalog (live overlay if refreshed, else generated baseline). */
export function getModelCatalog(): LlmCatalogModel[] {
	return MODELS;
}

/**
 * Look up a catalog entry by its stored provider + model. Matches on the compound
 * (providerId, id) since bare native ids are only unique per provider; the model id
 * is compared verbatim (slashes are not special). Falls back to an id-only match.
 */
export function findCatalogModel(
	provider: string,
	model: string,
): LlmCatalogModel | undefined {
	return (
		MODELS.find((m) => m.providerId === provider && m.id === model) ??
		MODELS.find((m) => m.id === model)
	);
}

/**
 * Fetch models.dev, transform against the curated allowlist, and replace the
 * in-memory catalog. Never throws.
 */
export async function refreshModelCatalog(): Promise<void> {
	try {
		const res = await fetch(MODELS_DEV_API_URL, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!res.ok) {
			logger.warn(
				{ status: res.status },
				'[modelCatalog] models.dev refresh failed — keeping current catalog',
			);
			return;
		}
		const raw = (await res.json()) as ModelsDevResponse;
		const next = transformModelsDev(raw, PROVIDERS);
		if (next.length === 0) {
			logger.warn('[modelCatalog] models.dev returned 0 allowlisted models — keeping current');
			return;
		}
		MODELS = next;
		lastRefreshedAt = new Date().toISOString();
		logger.info({ count: next.length }, '[modelCatalog] refreshed from models.dev');
	} catch (err) {
		logger.warn(
			{ err: err instanceof Error ? err.message : String(err) },
			'[modelCatalog] models.dev refresh errored — keeping current catalog',
		);
	}
}

let refreshTimer: NodeJS.Timeout | null = null;

/**
 * Kick off the initial refresh (non-blocking) and schedule a daily one.
 * Safe to call once at startup; the interval is unref'd so it never holds the
 * process open.
 */
export function startModelCatalogRefresh(): void {
	void refreshModelCatalog();
	if (!refreshTimer) {
		refreshTimer = setInterval(() => void refreshModelCatalog(), REFRESH_INTERVAL_MS);
		refreshTimer.unref();
	}
}

/** ISO timestamp of the last successful live refresh, or null (still baseline). */
export function getCatalogLastRefreshedAt(): string | null {
	return lastRefreshedAt;
}

// @repo/models — LLM provider + model catalog (browser-safe, no node:fs)
// LLM_MODELS is a generated baseline (see scripts/sync.ts); the backend overlays
// live models.dev data on top at runtime via its ModelCatalog service.
export { LLM_PROVIDERS } from './llm-catalog/index.js';
export { LLM_MODELS } from './llm-catalog/index.js';
export { MODELS_DEV_API_URL, transformModelsDev } from './llm-catalog/index.js';

import type { User, ApiKey } from './user.js';
import type { Role } from './user.js';
import type { LoginResponse } from './auth.js';
import type { HealthResponse } from './health.js';
import type { CredentialMetadata, CredentialDefinition } from './credential.js';
import type { LlmProviderConfig } from './llmProvider.js';

/** Standard API response envelope used by all backend endpoints */
export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/** GET /v1/auth/status */
export type AuthStatusResponse = ApiResponse<{ needsSetup: boolean }>;

/** POST /v1/auth/setup */
export type SetupResponse = ApiResponse<User>;

/** POST /v1/auth/login */
export type LoginApiResponse = ApiResponse<LoginResponse>;

// ─── Users ───────────────────────────────────────────────────────────────────

/** GET /v1/users */
export type UsersListResponse = ApiResponse<User[]>;

/** GET /v1/users/:id, GET /v1/users/profile, PATCH /v1/users/profile, PUT /v1/users/:id, POST /v1/users */
export type UserResponse = ApiResponse<User>;

/** POST /v1/users/profile/password */
export type PasswordUpdateResponse = ApiResponse<{ updated: true }>;

/** DELETE /v1/users/:id */
export type UserDeleteResponse = ApiResponse<{ deleted: true }>;

// ─── API Keys ─────────────────────────────────────────────────────────────────

/** POST /v1/api-keys — returns the raw key once on creation */
export type ApiKeyCreateResponse = ApiResponse<{ key: string }>;

/** GET /v1/api-keys */
export type ApiKeysListResponse = ApiResponse<ApiKey[]>;

/** DELETE /v1/api-keys/:id */
export type ApiKeyDeleteResponse = ApiResponse<{ deleted: true }>;

// ─── IAM Roles ────────────────────────────────────────────────────────────────

/** GET /v1/iam/roles */
export type RolesListResponse = ApiResponse<Role[]>;

/** GET /v1/iam/roles/:id, POST /v1/iam/roles, PUT /v1/iam/roles/:id */
export type RoleResponse = ApiResponse<Role>;

/** DELETE /v1/iam/roles/:id */
export type RoleDeleteResponse = ApiResponse<{ deleted: true }>;

// ─── Credentials ─────────────────────────────────────────────────────────────

/** GET /credentials/definitions */
export type CredentialDefinitionsResponse = ApiResponse<CredentialDefinition[]>;

/** GET /credentials/definitions/:id */
export type CredentialDefinitionResponse = ApiResponse<CredentialDefinition>;

/** GET /credentials */
export type CredentialsListResponse = ApiResponse<CredentialMetadata[]>;

/** GET /credentials/:id, POST /credentials, PUT /credentials/:id */
export type CredentialResponse = ApiResponse<CredentialMetadata>;

/** DELETE /credentials/:id */
export type CredentialDeleteResponse = ApiResponse<{ deleted: true }>;

/** POST /credentials/:id/test */
export type CredentialTestResponse = ApiResponse<{ valid: boolean; status: number }>;

// ─── LLM Providers ───────────────────────────────────────────────────────────

/** GET /llm-providers */
export type LlmProvidersListResponse = ApiResponse<LlmProviderConfig[]>;

/** GET /llm-providers/:id, POST /llm-providers, PUT /llm-providers/:id, POST /llm-providers/:id/set-default */
export type LlmProviderResponse = ApiResponse<LlmProviderConfig>;

/** DELETE /llm-providers/:id */
export type LlmProviderDeleteResponse = ApiResponse<{ deleted: true }>;

// ─── OAuth2 ──────────────────────────────────────────────────────────────────

/** GET /oauth2/authorize/:credentialId */
export type OAuth2AuthorizeResponse = ApiResponse<{ authorizationUrl: string }>;

/** GET /oauth2/callback */
export type OAuth2CallbackResponse = ApiResponse<{ message: string }>;

// ─── Health ──────────────────────────────────────────────────────────────────

/** GET /health */
export type HealthApiResponse = ApiResponse<HealthResponse>;

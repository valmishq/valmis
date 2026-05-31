/** Core authentication strategies supported by the credential system */
export type CredentialType =
	| 'apiKey'
	| 'basicAuth'
	| 'bearerToken'
	| 'oauth2'
	| 'oauth1'
	| 'custom';

/** Data types for credential property inputs */
export type PropertyType = 'string' | 'secret' | 'number' | 'boolean' | 'options';

/** Dropdown option for properties with type === 'options' */
export interface CredentialPropertyOption {
	name: string;
	value: string | number;
}

/** A single input field definition for a credential form */
export interface CredentialProperty {
	name: string;
	displayName: string;
	type: PropertyType;
	required: boolean;
	default?: string | number | boolean;
	description?: string;
	options?: CredentialPropertyOption[];
}

/** OAuth2-specific configuration block */
export interface OAuth2Config {
	authorizationUrl: string;
	accessTokenUrl: string;
	revokeUrl?: string;
	clientIdProperty?: string;
	clientSecretProperty?: string;
	scope?: string;
	authStyle?: 'inHeader' | 'inBody';
}

/** HTTP request mapping — tells the engine where to inject credentials */
export interface RequestMapping {
	headers?: Record<string, string>;
	qs?: Record<string, string>;
	body?: Record<string, string>;
}

/** Test request definition — used to validate a credential and optionally fetch account identity */
export interface TestRequest {
	method: 'GET' | 'POST';
	url: string;
	/**
	 * Dot-notation key path into the JSON response body whose value is stored as
	 * `connectedAccount` on the credential after a successful OAuth2 authorization.
	 * Example: "email"  →  response.email
	 *          "data.user.login"  →  response.data.user.login
	 */
	accountIdentifierKey?: string;
}

/**
 * Shape of a credential record without the encrypted data payload.
 * Shared between the backend service and API response types.
 *
 * `isAuthorized` is populated for OAuth2 credentials and is true when an access
 * token has been obtained (i.e. the user has completed the authorization flow).
 * `connectedAccount` holds the email or display name of the authorized account,
 * fetched from the provider's identity endpoint at authorization time.
 */
export interface CredentialMetadata {
	id: string;
	ownerId: string;
	name: string;
	type: string;
	createdAt: Date;
	updatedAt: Date;
	/** OAuth2 only — true when an access token is present */
	isAuthorized?: boolean;
	/** OAuth2 only — email or display name of the connected account */
	connectedAccount?: string;
}

/** Full credential definition loaded from a YAML file */
export interface CredentialDefinition {
	id: string;
	name: string;
	type: CredentialType;
	/** Path or URL to the service logo/icon for the UI */
	icon?: string;
	description?: string;
	documentationUrl?: string;
	properties: CredentialProperty[];
	requestMapping?: RequestMapping;
	oauth2?: OAuth2Config;
	testRequest?: TestRequest;
}

// ─── Request Bodies ───────────────────────────────────────────────────────────

/** POST /v1/credentials — create a new credential */
export interface CreateCredentialRequestBody {
	ownerId: string;
	name: string;
	type: string;
	data: Record<string, unknown>;
}

/** PUT /v1/credentials/:id — update an existing credential */
export interface UpdateCredentialRequestBody {
	ownerId: string;
	name?: string;
	data?: Record<string, unknown>;
}

/**
 * Shared single-field body carrying only an ownerId.
 * Used by: POST /v1/credentials/:id/test, DELETE /v1/credentials/:id,
 *          POST /v1/llm-providers/:id/set-default, DELETE /v1/llm-providers/:id
 */
export interface OwnerIdRequestBody {
	ownerId: string;
}

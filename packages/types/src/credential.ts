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

/** Test request definition — used to validate a credential on save */
export interface TestRequest {
	method: 'GET' | 'POST';
	url: string;
}

/**
 * Shape of a credential record without the encrypted data payload.
 * Shared between the backend service and API response types.
 */
export interface CredentialMetadata {
	id: string;
	ownerId: string;
	name: string;
	type: string;
	createdAt: Date;
	updatedAt: Date;
}

/** Full credential definition loaded from a YAML file */
export interface CredentialDefinition {
	id: string;
	name: string;
	type: CredentialType;
	description?: string;
	documentationUrl?: string;
	properties: CredentialProperty[];
	requestMapping?: RequestMapping;
	oauth2?: OAuth2Config;
	testRequest?: TestRequest;
}

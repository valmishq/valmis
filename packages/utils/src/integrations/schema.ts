import { z } from 'zod';

/** Zod schema for validating credential YAML definitions at load time */

const credentialTypeSchema = z.enum([
	'apiKey',
	'basicAuth',
	'bearerToken',
	'oauth2',
	'oauth1',
	'custom',
]);

const propertyTypeSchema = z.enum(['string', 'secret', 'number', 'boolean', 'options']);

const credentialPropertyOptionSchema = z.object({
	name: z.string(),
	value: z.union([z.string(), z.number()]),
});

const credentialPropertySchema = z.object({
	name: z.string(),
	displayName: z.string(),
	type: propertyTypeSchema,
	required: z.boolean(),
	default: z.union([z.string(), z.number(), z.boolean()]).optional(),
	description: z.string().optional(),
	options: z.array(credentialPropertyOptionSchema).optional(),
});

const requestMappingSchema = z.object({
	headers: z.record(z.string(), z.string()).optional(),
	qs: z.record(z.string(), z.string()).optional(),
	body: z.record(z.string(), z.string()).optional(),
});

const oauth2ConfigSchema = z.object({
	authorizationUrl: z.string().url(),
	accessTokenUrl: z.string().url(),
	revokeUrl: z.string().url().optional(),
	clientIdProperty: z.string().optional(),
	clientSecretProperty: z.string().optional(),
	scope: z.string().optional(),
	authStyle: z.enum(['inHeader', 'inBody']).optional(),
	/** Defaults to authorizationCode when omitted */
	grantType: z.enum(['authorizationCode', 'clientCredentials']).optional(),
	/** When true, PKCE S256 challenge is used instead of client_secret */
	usePkce: z.boolean().optional(),
});

const testRequestSchema = z.object({
	method: z.enum(['GET', 'POST']),
	url: z.string().url(),
	/**
	 * Dot-notation key path into the JSON response body whose value will be
	 * stored as `connectedAccount` on the credential after a successful OAuth2
	 * authorization. Only used during the OAuth2 callback flow.
	 * Example: "email"  →  response.email
	 *          "data.user.login"  →  response.data.user.login
	 */
	accountIdentifierKey: z.string().optional(),
});

export const credentialDefinitionSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: credentialTypeSchema,
	icon: z.string().optional(),
	description: z.string().optional(),
	documentationUrl: z.string().url().optional(),
	properties: z.array(credentialPropertySchema),
	requestMapping: requestMappingSchema.optional(),
	oauth2: oauth2ConfigSchema.optional(),
	testRequest: testRequestSchema.optional(),
});

export type ValidatedCredentialDefinition = z.infer<typeof credentialDefinitionSchema>;

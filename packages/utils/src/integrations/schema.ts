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
});

const testRequestSchema = z.object({
  method: z.enum(['GET', 'POST']),
  url: z.string().url(),
});

export const credentialDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: credentialTypeSchema,
  description: z.string().optional(),
  documentationUrl: z.string().url().optional(),
  properties: z.array(credentialPropertySchema),
  requestMapping: requestMappingSchema.optional(),
  oauth2: oauth2ConfigSchema.optional(),
  testRequest: testRequestSchema.optional(),
});

export type ValidatedCredentialDefinition = z.infer<typeof credentialDefinitionSchema>;

import type { CredentialDefinition, RequestMapping } from '@repo/types';
import { getCredentialDefinition } from '@repo/utils';
import { CredentialService } from './credentialService.js';

/** The resolved authentication context ready to inject into an HTTP request */
export interface ResolvedCredential {
  headers: Record<string, string>;
  qs: Record<string, string>;
  body: Record<string, string>;
}

/** Token refresh threshold — refresh if token expires within this many ms */
const REFRESH_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Service responsible for resolving credential data into HTTP request
 * components (headers, query params, body) based on the YAML definitions.
 * Handles OAuth2 token refresh logic transparently.
 */
export class CredentialResolverService {
  private credentialService: CredentialService;

  constructor(credentialService: CredentialService) {
    this.credentialService = credentialService;
  }

  /**
   * Resolves a credential into ready-to-use HTTP request components.
   * For OAuth2 credentials, triggers token refresh if the token is expired.
   */
  async resolve(credentialId: string): Promise<ResolvedCredential> {
    const metadata = await this.credentialService.getById(credentialId);
    if (!metadata) {
      throw new Error(`Credential not found: ${credentialId}`);
    }

    const definition = getCredentialDefinition(metadata.type);
    if (!definition) {
      throw new Error(`No credential definition found for type: ${metadata.type}`);
    }

    let data = await this.credentialService.getDecryptedData(credentialId);
    if (!data) {
      throw new Error(`Failed to decrypt credential data for: ${credentialId}`);
    }

    // Handle OAuth2 token refresh if needed
    if (definition.type === 'oauth2') {
      data = await this.ensureValidToken(credentialId, data, definition);
    }

    return this.applyRequestMapping(data, definition);
  }

  /**
   * Checks if the OAuth2 access token is expired or about to expire.
   * If so, refreshes it and updates the stored credential data.
   */
  private async ensureValidToken(
    credentialId: string,
    data: Record<string, unknown>,
    definition: CredentialDefinition,
  ): Promise<Record<string, unknown>> {
    const expiresAt = data.expiresAt as number | undefined;

    if (!expiresAt || Date.now() >= expiresAt - REFRESH_THRESHOLD_MS) {
      const refreshed = await this.refreshOAuth2Token(data, definition);
      await this.credentialService.updateData(credentialId, refreshed);
      return refreshed;
    }

    return data;
  }

  /**
   * Performs the OAuth2 token refresh request using the refresh token.
   * Returns updated data with new access token, refresh token, and expiration.
   */
  private async refreshOAuth2Token(
    data: Record<string, unknown>,
    definition: CredentialDefinition,
  ): Promise<Record<string, unknown>> {
    const oauth2Config = definition.oauth2;
    if (!oauth2Config) {
      throw new Error(`OAuth2 config missing for definition: ${definition.id}`);
    }

    const refreshToken = data.refreshToken as string | undefined;
    if (!refreshToken) {
      throw new Error(`No refresh token available for credential type: ${definition.id}`);
    }

    const clientIdKey = oauth2Config.clientIdProperty ?? 'clientId';
    const clientSecretKey = oauth2Config.clientSecretProperty ?? 'clientSecret';
    const clientId = data[clientIdKey] as string;
    const clientSecret = data[clientSecretKey] as string;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // If authStyle is inHeader, send client credentials via Basic auth
    if (oauth2Config.authStyle === 'inHeader') {
      const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    }

    const response = await fetch(oauth2Config.accessTokenUrl, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OAuth2 token refresh failed (${response.status}): ${errorBody}`);
    }

    const tokenResponse = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    return {
      ...data,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? refreshToken,
      expiresAt: tokenResponse.expires_in
        ? Date.now() + tokenResponse.expires_in * 1000
        : undefined,
    };
  }

  /**
   * Applies the YAML requestMapping template to produce final HTTP components.
   * Replaces {{properties.keyName}} placeholders with actual decrypted values.
   */
  private applyRequestMapping(
    data: Record<string, unknown>,
    definition: CredentialDefinition,
  ): ResolvedCredential {
    const mapping = definition.requestMapping;
    if (!mapping) {
      return { headers: {}, qs: {}, body: {} };
    }

    return {
      headers: this.interpolateRecord(mapping.headers ?? {}, data),
      qs: this.interpolateRecord(mapping.qs ?? {}, data),
      body: this.interpolateRecord(mapping.body ?? {}, data),
    };
  }

  /**
   * Interpolates {{properties.keyName}} placeholders in a Record's values.
   */
  private interpolateRecord(
    record: Record<string, string>,
    data: Record<string, unknown>,
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, template] of Object.entries(record)) {
      result[key] = this.interpolateTemplate(template, data);
    }

    return result;
  }

  /**
   * Replaces all {{properties.keyName}} occurrences in a template string.
   */
  private interpolateTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{properties\.(\w+)\}\}/g, (_match, propertyName: string) => {
      const value = data[propertyName];
      return value !== undefined ? String(value) : '';
    });
  }
}

import type { CloudFileListResult } from '@repo/types';

/** Identifies whose credential performs the provider API calls */
export interface CloudProviderContext {
	credentialId: string;
	ownerId: string;
}

export interface CloudListOptions {
	/** Provider-specific folder identifier — omitted means the root folder */
	folderId?: string;
	/** Opaque pagination token from a previous CloudFileListResult */
	pageToken?: string;
	/** Free-text file name search — when set, providers may search globally */
	search?: string;
}

/** Reference to one cloud file selected for download */
export interface CloudFileRef {
	externalId: string;
	name: string;
	mimeType?: string;
}

export interface CloudDownloadResult {
	data: Buffer;
	/** Effective name after any export conversion (e.g. "Report" → "Report.docx") */
	name: string;
	mimeType: string;
}

/**
 * Pluggable cloud storage provider — the open protocol for knowledge-base
 * imports. Implementations own ALL outbound URLs: callers can only pass
 * opaque ids/tokens, which each provider validates/encodes itself. All HTTP
 * goes through CredentialResolverService.executeWithCredential so OAuth2
 * refresh (proactive + reactive 401) is handled uniformly.
 *
 * Adding a provider = one implementation + one registration in
 * CloudProviderRegistry (+ optionally a credential YAML definition).
 */
export interface CloudStorageProvider {
	readonly id: string;
	readonly displayName: string;
	/** Static logo path served by the web app (e.g. '/logos/google-drive.svg') */
	readonly icon?: string;
	/** Credential definition ids this provider accepts */
	readonly compatibleCredentialTypes: string[];
	list(ctx: CloudProviderContext, options: CloudListOptions): Promise<CloudFileListResult>;
	download(ctx: CloudProviderContext, file: CloudFileRef): Promise<CloudDownloadResult>;
}

/** Reads a capped error-body excerpt for provider error messages */
export async function readErrorExcerpt(response: Response): Promise<string> {
	const MAX_ERROR_BODY_CHARS = 300;
	try {
		const text = await response.text();
		return text.slice(0, MAX_ERROR_BODY_CHARS);
	} catch {
		return '';
	}
}

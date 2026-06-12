import type { CredentialResolverService } from '../CredentialResolverService.js';
import type { CloudStorageProvider } from './CloudStorageProvider.js';
import { GoogleDriveProvider } from './providers/GoogleDriveProvider.js';
import { DropboxProvider } from './providers/DropboxProvider.js';
import { OneDriveProvider } from './providers/OneDriveProvider.js';

/**
 * Registry of cloud storage providers usable for knowledge-base imports.
 * Adding a future provider = one CloudStorageProvider implementation plus
 * one entry in the constructor below.
 */
export class CloudProviderRegistry {
	private providers: Map<string, CloudStorageProvider>;

	constructor(resolver: CredentialResolverService) {
		const all: CloudStorageProvider[] = [
			new GoogleDriveProvider(resolver),
			new DropboxProvider(resolver),
			new OneDriveProvider(resolver),
		];
		this.providers = new Map(all.map((provider) => [provider.id, provider]));
	}

	getAll(): CloudStorageProvider[] {
		return [...this.providers.values()];
	}

	getById(id: string): CloudStorageProvider | undefined {
		return this.providers.get(id);
	}

	/** True when a credential's definition id is accepted by the provider */
	isCompatible(provider: CloudStorageProvider, credentialType: string): boolean {
		return provider.compatibleCredentialTypes.includes(credentialType);
	}
}

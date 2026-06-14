import type { CredentialResolverService } from '../CredentialResolverService.js';
import type { CredentialService } from '../CredentialService.js';
import type { AppTriggerProviderContext } from './AppTriggerProvider.js';

/**
 * Builds the credential-bound context an AppTriggerProvider uses for outbound calls.
 * Shared by AppTriggerManager (listen/register/poll) and the catalog route's resource
 * listing so both construct the ctx identically — OAuth refresh handled by the resolver.
 */
export function buildProviderContext(
	resolver: CredentialResolverService,
	credentialService: CredentialService,
	credentialId: string,
	ownerId: string,
): AppTriggerProviderContext {
	return {
		credentialId,
		ownerId,
		execute: (request) => resolver.executeWithCredential(credentialId, ownerId, request),
		loadCredentialData: async () => {
			const data = await credentialService.getDecryptedData(credentialId, ownerId);
			if (!data) throw new Error(`Failed to load credential data: ${credentialId}`);
			return data;
		},
		saveCredentialData: (data) => credentialService.updateData(credentialId, ownerId, data),
	};
}

import { IamService } from './IamService.js';
import type { AppActions, AppSubjects } from '@repo/types';

const iamService = new IamService();

/**
 * Service responsible for checking user permissions via CASL.
 * Delegates to IamService to build the user's ability from their roles.
 */
export class AuthorizationService {
	/**
	 * Check whether a user can perform an action on a subject.
	 * Optionally pass a resourceObject for condition-based (instance-level) checks.
	 */
	async can(
		userId: string,
		action: AppActions,
		subject: AppSubjects,
		resourceObject?: Record<string, unknown>,
	): Promise<boolean> {
		const ability = await iamService.getAbilityForUser(userId);

		if (resourceObject) {
			// CASL supports condition checks against a concrete object — cast via unknown to satisfy type overlap
			return ability.can(action, resourceObject as unknown as Parameters<typeof ability.can>[1]);
		}

		return ability.can(action, subject);
	}
}

import { createMongoAbility, type MongoAbility, type RawRuleOf } from '@casl/ability';
import type { CaslPolicy, AppActions, AppSubjects } from '@repo/types';

/** The typed ability for this application */
export type AppAbility = MongoAbility<[AppActions, AppSubjects]>;

/**
 * Build a CASL MongoAbility from an array of CaslPolicy rules.
 * MongoDB query operators in conditions are supported via CASL's built-in
 * @ucast/mongo2js integration.
 */
export function createAbilityFor(policies: CaslPolicy[]): AppAbility {
	return createMongoAbility<AppAbility>(policies as RawRuleOf<AppAbility>[]);
}

import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { InstalledSkill, SkillCatalogEntry } from '@repo/types';

/**
 * Skills management page.
 * Loads the user's installed skills (full provenance metadata) and the merged
 * catalog (to show built-in skills in a read-only section).
 */
export const load: PageServerLoad = async (event) => {
	const [installedRes, catalogRes] = await Promise.all([
		api('/skills/installed', event),
		api('/skills', event)
	]);

	let installed: InstalledSkill[] = [];
	if (installedRes.ok) {
		const body = await installedRes.json();
		installed = (body.data ?? []) as InstalledSkill[];
	}

	let builtins: SkillCatalogEntry[] = [];
	if (catalogRes.ok) {
		const body = await catalogRes.json();
		builtins = ((body.data ?? []) as SkillCatalogEntry[]).filter((s) => s.source === 'builtin');
	}

	return { installed, builtins };
};

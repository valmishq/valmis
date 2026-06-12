import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { KnowledgeFile } from '@repo/types';

export const load: PageServerLoad = async (event) => {
	const ownerId = event.locals.user?.id;
	if (!ownerId) {
		error(401, 'Not authenticated');
	}

	const filesRes = await api('/knowledge/files', event);

	let files: KnowledgeFile[] = [];
	if (filesRes.ok) {
		const body = await filesRes.json();
		files = (body.data ?? []) as KnowledgeFile[];
	}

	return { files };
};

import type { CloudFileEntry, CloudFileListResult } from '@repo/types';
import type { CredentialResolverService } from '../../CredentialResolverService.js';
import {
	readErrorExcerpt,
	type CloudDownloadResult,
	type CloudFileRef,
	type CloudListOptions,
	type CloudProviderContext,
	type CloudStorageProvider,
} from '../CloudStorageProvider.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
/** Graph pagination tokens are full @odata.nextLink URLs — only this origin is ever fetched */
const GRAPH_ORIGIN_PREFIX = 'https://graph.microsoft.com/';
const PAGE_SIZE = 50;
const SELECT_FIELDS = 'id,name,size,file,folder,lastModifiedDateTime';

interface GraphDriveItem {
	id: string;
	name: string;
	size?: number;
	lastModifiedDateTime?: string;
	file?: { mimeType?: string };
	folder?: { childCount?: number };
}

interface GraphListResponse {
	value: GraphDriveItem[];
	'@odata.nextLink'?: string;
}

function toCloudEntry(item: GraphDriveItem): CloudFileEntry {
	return {
		externalId: item.id,
		name: item.name,
		kind: item.folder ? 'folder' : 'file',
		mimeType: item.file?.mimeType,
		sizeBytes: item.size,
		modifiedAt: item.lastModifiedDateTime,
	};
}

export class OneDriveProvider implements CloudStorageProvider {
	readonly id = 'onedrive';
	readonly displayName = 'OneDrive / SharePoint';
	readonly icon = '/logos/microsoft-onedrive.svg';
	readonly compatibleCredentialTypes = ['microsoft-onedrive'];

	private resolver: CredentialResolverService;

	constructor(resolver: CredentialResolverService) {
		this.resolver = resolver;
	}

	async list(ctx: CloudProviderContext, options: CloudListOptions): Promise<CloudFileListResult> {
		let url: string;
		let qs: Record<string, string> | undefined;

		if (options.pageToken) {
			// SSRF guard: the round-tripped nextLink must stay on the Graph origin
			if (!options.pageToken.startsWith(GRAPH_ORIGIN_PREFIX)) {
				throw new Error('Invalid OneDrive page token.');
			}
			url = options.pageToken;
		} else if (options.search) {
			// Graph search literal: single quotes are escaped by doubling
			const escaped = options.search.replace(/'/g, "''");
			url = `${GRAPH_BASE}/me/drive/root/search(q='${encodeURIComponent(escaped)}')`;
			qs = { $top: String(PAGE_SIZE), $select: SELECT_FIELDS };
		} else if (options.folderId) {
			url = `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(options.folderId)}/children`;
			qs = { $top: String(PAGE_SIZE), $select: SELECT_FIELDS };
		} else {
			url = `${GRAPH_BASE}/me/drive/root/children`;
			qs = { $top: String(PAGE_SIZE), $select: SELECT_FIELDS };
		}

		const response = await this.resolver.executeWithCredential(ctx.credentialId, ctx.ownerId, {
			url,
			method: 'GET',
			qs,
		});
		if (!response.ok) {
			throw new Error(
				`OneDrive list failed (${response.status}): ${await readErrorExcerpt(response)}`,
			);
		}

		const body = (await response.json()) as GraphListResponse;
		return {
			entries: body.value.map(toCloudEntry),
			nextPageToken: body['@odata.nextLink'],
		};
	}

	async download(ctx: CloudProviderContext, file: CloudFileRef): Promise<CloudDownloadResult> {
		// Graph 302-redirects /content to a pre-authenticated download URL; fetch follows it
		const response = await this.resolver.executeWithCredential(ctx.credentialId, ctx.ownerId, {
			url: `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(file.externalId)}/content`,
			method: 'GET',
		});
		if (!response.ok) {
			throw new Error(
				`OneDrive download failed (${response.status}): ${await readErrorExcerpt(response)}`,
			);
		}
		return {
			data: Buffer.from(await response.arrayBuffer()),
			name: file.name,
			mimeType: file.mimeType ?? response.headers.get('content-type') ?? 'application/octet-stream',
		};
	}
}

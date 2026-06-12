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

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_NATIVE_PREFIX = 'application/vnd.google-apps.';
const PAGE_SIZE = 50;

/** Google-native formats exported to OOXML before extraction */
const EXPORT_MAP: Record<string, { exportMime: string; extension: string }> = {
	'application/vnd.google-apps.document': {
		exportMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		extension: '.docx',
	},
	'application/vnd.google-apps.spreadsheet': {
		exportMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		extension: '.xlsx',
	},
	'application/vnd.google-apps.presentation': {
		exportMime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		extension: '.pptx',
	},
};

interface DriveFileResource {
	id: string;
	name: string;
	mimeType: string;
	size?: string;
	modifiedTime?: string;
}

interface DriveListResponse {
	nextPageToken?: string;
	files?: DriveFileResource[];
}

/** Escape a value for embedding in a Drive `q` single-quoted string literal */
function escapeDriveQuery(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class GoogleDriveProvider implements CloudStorageProvider {
	readonly id = 'google-drive';
	readonly displayName = 'Google Drive';
	readonly icon = '/logos/google-drive.svg';
	/** The Google Workspace definition's default scope already includes Drive access */
	readonly compatibleCredentialTypes = ['google-drive', 'googleWorkspaceOAuth2'];

	private resolver: CredentialResolverService;

	constructor(resolver: CredentialResolverService) {
		this.resolver = resolver;
	}

	async list(ctx: CloudProviderContext, options: CloudListOptions): Promise<CloudFileListResult> {
		const query = options.search
			? `trashed=false and name contains '${escapeDriveQuery(options.search)}'`
			: `'${escapeDriveQuery(options.folderId ?? 'root')}' in parents and trashed=false`;

		const qs: Record<string, string> = {
			q: query,
			fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)',
			orderBy: 'folder,name',
			pageSize: String(PAGE_SIZE),
		};
		if (options.pageToken) qs.pageToken = options.pageToken;

		const response = await this.resolver.executeWithCredential(ctx.credentialId, ctx.ownerId, {
			url: DRIVE_FILES_URL,
			method: 'GET',
			qs,
		});
		if (!response.ok) {
			throw new Error(
				`Google Drive list failed (${response.status}): ${await readErrorExcerpt(response)}`,
			);
		}

		const body = (await response.json()) as DriveListResponse;
		const entries: CloudFileEntry[] = (body.files ?? []).map((file) => ({
			externalId: file.id,
			name: file.name,
			kind: file.mimeType === FOLDER_MIME ? 'folder' : 'file',
			mimeType: file.mimeType,
			sizeBytes: file.size !== undefined ? Number(file.size) : undefined,
			modifiedAt: file.modifiedTime,
		}));

		return { entries, nextPageToken: body.nextPageToken };
	}

	async download(ctx: CloudProviderContext, file: CloudFileRef): Promise<CloudDownloadResult> {
		const encodedId = encodeURIComponent(file.externalId);

		if (file.mimeType?.startsWith(GOOGLE_NATIVE_PREFIX)) {
			const exportConfig = EXPORT_MAP[file.mimeType];
			if (!exportConfig) {
				throw new Error(
					`Google file type '${file.mimeType}' cannot be imported — only Docs, Sheets, and Slides are exportable.`,
				);
			}
			const response = await this.resolver.executeWithCredential(ctx.credentialId, ctx.ownerId, {
				url: `${DRIVE_FILES_URL}/${encodedId}/export`,
				method: 'GET',
				qs: { mimeType: exportConfig.exportMime },
			});
			if (!response.ok) {
				throw new Error(
					`Google Drive export failed (${response.status}): ${await readErrorExcerpt(response)}`,
				);
			}
			const name = file.name.endsWith(exportConfig.extension)
				? file.name
				: `${file.name}${exportConfig.extension}`;
			return {
				data: Buffer.from(await response.arrayBuffer()),
				name,
				mimeType: exportConfig.exportMime,
			};
		}

		const response = await this.resolver.executeWithCredential(ctx.credentialId, ctx.ownerId, {
			url: `${DRIVE_FILES_URL}/${encodedId}`,
			method: 'GET',
			qs: { alt: 'media' },
		});
		if (!response.ok) {
			throw new Error(
				`Google Drive download failed (${response.status}): ${await readErrorExcerpt(response)}`,
			);
		}
		return {
			data: Buffer.from(await response.arrayBuffer()),
			name: file.name,
			mimeType: file.mimeType ?? response.headers.get('content-type') ?? 'application/octet-stream',
		};
	}
}

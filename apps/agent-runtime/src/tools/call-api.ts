import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { logger } from '@repo/utils';
import type { ToolContext } from './types.js';

/** Maximum allowed body size in bytes — 1 MB. Overridable via ToolContext. */
const DEFAULT_MAX_BODY_BYTES = 1_048_576;

/**
 * call_api — Make an HTTP request to an external service.
 *
 * credentialId is OPTIONAL:
 *   - For authenticated APIs: provide the correct credentialId from the
 *     Available Credentials list. The host will inject the auth headers.
 *   - For public APIs that need no authentication: pass an empty string ""
 *     as credentialId. The request will be forwarded without any credential
 *     injection.
 *
 * IMPORTANT: Never attach a credential to a request unless you are certain
 * that credential belongs to the target service. Using a mismatched credential
 * risks leaking secrets to unintended third-party services.
 */
export function createCallApiTool(ctx: ToolContext): AgentTool {
	const maxBodyBytes = ctx.callApiMaxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

	const tool: AgentTool = {
		name: 'call_api',
		label: 'Call External API',
		description:
			'Make an HTTP request to an external URL. ' +
			'For authenticated APIs: provide the correct credentialId from the Available Credentials list — ' +
			'the host will inject the correct auth headers automatically. ' +
			'For public APIs that require NO authentication (e.g. open data endpoints): ' +
			'pass an empty string "" as credentialId. ' +
			'IMPORTANT: Never use a credential for a service it does not belong to. ' +
			'Using a mismatched credential risks leaking secrets to third-party services.',
		parameters: Type.Object({
			credentialId: Type.Optional(
				Type.String({
					description:
						'ID of the credential to use for authenticated APIs. ' +
						'Omit or leave empty for public APIs that need no authentication.',
				}),
			),
			method: Type.Union([
				Type.Literal('GET'),
				Type.Literal('POST'),
				Type.Literal('PUT'),
				Type.Literal('DELETE'),
				Type.Literal('PATCH'),
			]),
			url: Type.String({ description: 'Full URL' }),
			headers: Type.Optional(Type.Record(Type.String(), Type.String())),
			qs: Type.Optional(Type.Record(Type.String(), Type.String())),
			body: Type.Optional(Type.String({ description: 'Request body string (max 1 MB)' })),
		}),
		execute: async (_toolCallId, params) => {
			const p = params as {
				credentialId?: string;
				method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
				url: string;
				headers?: Record<string, string>;
				qs?: Record<string, string>;
				body?: string;
			};

			// Guard against oversized bodies before forwarding to the proxy
			if (p.body && Buffer.byteLength(p.body, 'utf-8') > maxBodyBytes) {
				const textContent: TextContent = {
					type: 'text',
					text: `Error: call_api body exceeds maximum allowed size (${maxBodyBytes} bytes)`,
				};
				return { content: [textContent], details: {} };
			}

			logger.debug(
				{ credentialId: p.credentialId || '(none)', method: p.method, url: p.url },
				'[agent-runner] call_api executing',
			);

			// Pass empty string when no credential is needed — the proxy will
			// skip credential injection and forward the request as-is.
			const response = await ctx.proxyClient.proxy({
				...p,
				credentialId: p.credentialId ?? '',
			});

			logger.debug({ status: response.status }, '[agent-runner] call_api response');

			const textContent: TextContent = {
				type: 'text',
				text: `HTTP ${response.status}\n${response.body}`,
			};
			return { content: [textContent], details: {} };
		},
	};

	return tool;
}

import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { logger } from '@repo/utils';
import type { ToolContext } from './types.js';

/** Maximum allowed body size in bytes — 1 MB. Overridable via ToolContext. */
const DEFAULT_MAX_BODY_BYTES = 1_048_576;

/**
 * call_api — Make an authenticated HTTP request using a connected credential.
 *
 * The host backend resolves the credential, executes the HTTP request, and
 * returns the response body.  Raw credential values never enter this process.
 */
export function createCallApiTool(ctx: ToolContext): AgentTool {
	const maxBodyBytes = ctx.callApiMaxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

	const tool: AgentTool = {
		name: 'call_api',
		label: 'Call External API',
		description:
			"Make an authenticated HTTP request to an external service using one of the agent's " +
			'connected credentials. The host handles credential injection.',
		parameters: Type.Object({
			credentialId: Type.String({ description: 'ID of the credential to use' }),
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
				credentialId: string;
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
				{ credentialId: p.credentialId, method: p.method, url: p.url },
				'[agent-runner] call_api executing',
			);

			const response = await ctx.proxyClient.proxy(p);

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

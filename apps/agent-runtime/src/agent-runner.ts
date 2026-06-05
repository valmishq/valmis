import { Agent, type StreamFn } from '@earendil-works/pi-agent-core';
import {
	type Model,
	type TextContent,
	type ImageContent,
	type UserMessage,
	type AssistantMessage,
	type ToolResultMessage,
	type ToolCall,
	type Message,
	type Context,
	type Usage,
	createAssistantMessageEventStream,
} from '@earendil-works/pi-ai';
import type { AgentRuntimeConfig, LlmProxyRequest } from '@repo/types';
import { logger, resolveProviderApi } from '@repo/utils';
import { ProxyClient } from './proxy-client.js';
import { createAgentTools } from './tools/index.js';

/** Zero-value Usage for the placeholder AssistantMessage returned by the proxy streamFn */
const zeroUsage: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/**
 * Persistent workspace root for this agent process.
 * Injected by AgentRuntimeService as WORKSPACE_ROOT — one directory per agentId.
 * Falls back to /workspace so legacy Docker deployments still work if needed.
 */
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? '/workspace';

/**
 * Builds and runs the pi-agent Agent for a single task/conversation turn.
 *
 * Security:
 *   - No LLM API key in this process. All LLM calls go through ProxyClient.llmStream().
 *   - No credential values in this process. All API calls go through ProxyClient.proxy().
 *   - File tools are restricted to WORKSPACE_ROOT — path traversal is rejected.
 *
 * Flow:
 *   1. Load conversation history from host via ProxyClient.loadMessages()
 *   2. Build tools via createAgentTools() from src/tools/
 *   3. Build pi-agent Agent with a proxy streamFn (routes LLM calls to host)
 *   4. Agent runs its tool loop — tools execute locally or via proxy
 *   5. Tool results are persisted via ProxyClient.appendToolResult()
 *   6. Agent finishes; process exits
 */
export async function runAgent(
	config: AgentRuntimeConfig,
	proxyClient: ProxyClient,
): Promise<void> {
	// ── Provider → pi-ai API identifier mapping ───────────────────────────────
	// Uses the shared resolveProviderApi from @repo/utils so this mapping stays
	// in sync with AgentLlmProxyService. The `api` field on AssistantMessage must
	// match what the host uses or pi-ai will serialise tool-call history incorrectly
	// on the second turn (after a tool execution) for non-OpenAI providers.
	const resolvedApi = resolveProviderApi(config.modelProvider ?? '');

	// ── Build all tools ───────────────────────────────────────────────────────
	const tools = createAgentTools({
		proxyClient,
		workspaceRoot: WORKSPACE_ROOT,
	});

	// ── streamFn: routes every LLM call through the host proxy ────────────────
	const streamFn: StreamFn = (model, context, options) => {
		const ctx = context as Context;
		const request: LlmProxyRequest = {
			messages: ctx.messages,
			systemPrompt: ctx.systemPrompt ?? config.systemInstruction,
			tools: ctx.tools,
			thinkingLevel: options?.reasoning,
		};

		logger.debug(
			{ messages: ctx.messages.length, tools: (ctx.tools ?? []).length },
			'[agent-runner] → LLM stream request',
		);

		const eventStream = createAssistantMessageEventStream();

		proxyClient
			.llmStream(request)
			.then((contentBlocks) => {
				const toolCalls = contentBlocks.filter((b) => b.type === 'toolCall').length;
				logger.debug(
					{ contentBlocks: contentBlocks.length, toolCalls },
					'[agent-runner] ← LLM stream response',
				);

				const content: AssistantMessage['content'] = contentBlocks.map((block) => {
					if (block.type === 'text') {
						return { type: 'text' as const, text: block.text } as TextContent;
					}
					if (block.type === 'thinking') {
						return { type: 'thinking' as const, thinking: block.thinking };
					}
					const tc = block as {
						type: 'toolCall';
						id: string;
						name: string;
						arguments: Record<string, unknown>;
					};
					return {
						type: 'toolCall' as const,
						id: tc.id,
						name: tc.name,
						arguments: tc.arguments,
					} as ToolCall;
				});

				const assistantMessage: AssistantMessage = {
					role: 'assistant',
					content,
					api: resolvedApi as AssistantMessage['api'],
					provider: config.modelProvider || 'proxy',
					model: config.modelId || 'proxy',
					usage: zeroUsage,
					stopReason: 'stop',
					timestamp: Date.now(),
				};

				eventStream.push({ type: 'done', reason: 'stop', message: assistantMessage });
				eventStream.end(assistantMessage);
			})
			.catch((err: Error) => {
				logger.error({ err }, '[agent-runner] LLM stream error');
				const errorMessage: AssistantMessage = {
					role: 'assistant',
					content: [],
					api: resolvedApi as AssistantMessage['api'],
					provider: config.modelProvider || 'proxy',
					model: config.modelId || 'proxy',
					usage: zeroUsage,
					stopReason: 'error',
					errorMessage: err.message,
					timestamp: Date.now(),
				};
				eventStream.push({ type: 'error', reason: 'error', error: errorMessage });
				eventStream.end(errorMessage);
			});

		return eventStream;
	};

	// ── Load conversation history ─────────────────────────────────────────────
	logger.debug({ threadId: config.threadId }, '[agent-runner] loading message history');
	const existingMessages = await proxyClient.loadMessages();
	logger.info(
		{ threadId: config.threadId, count: existingMessages.length, triggerType: config.triggerType },
		'[agent-runner] message history loaded',
	);

	// Convert DB messages to pi-ai Message[]
	const agentMessages: Message[] = existingMessages.map((msg) => {
		if (msg.role === 'user') {
			const userMsg: UserMessage = {
				role: 'user',
				content: msg.content
					.filter((b) => b.type === 'text' || b.type === 'image')
					.map((b) => b as TextContent | ImageContent),
				timestamp: msg.createdAt instanceof Date ? msg.createdAt.getTime() : Date.now(),
			};
			return userMsg;
		}
		if (msg.role === 'assistant') {
			const assistantMsg: AssistantMessage = {
				role: 'assistant',
				content: msg.content as AssistantMessage['content'],
				api: resolvedApi as AssistantMessage['api'],
				provider: config.modelProvider || 'proxy',
				model: config.modelId || 'proxy',
				usage: zeroUsage,
				stopReason: 'stop',
				timestamp: msg.createdAt instanceof Date ? msg.createdAt.getTime() : Date.now(),
			};
			return assistantMsg;
		}
		// tool_result
		const toolResultMsg: ToolResultMessage = {
			role: 'toolResult',
			toolCallId: msg.toolCallId ?? '',
			toolName: msg.toolName ?? '',
			content: msg.content
				.filter((b) => b.type === 'text' || b.type === 'image')
				.map((b) => b as TextContent | ImageContent),
			isError: false,
			timestamp: msg.createdAt instanceof Date ? msg.createdAt.getTime() : Date.now(),
		};
		return toolResultMsg;
	});

	// ── Build effective system prompt ─────────────────────────────────────────
	// Append the list of authorised credential IDs so the model knows exactly
	// which IDs to pass to call_api. Without this the model will hallucinate
	// plausible-sounding IDs (e.g. "google") which the proxy will reject.
	let effectiveSystemPrompt = config.systemInstruction;
	if (config.credentialIds.length > 0) {
		effectiveSystemPrompt +=
			`\n\n## Available Credentials\n` +
			`The following credential IDs are available for use with the call_api tool.\n` +
			`Always use one of these exact IDs as the \`credentialId\` parameter:\n` +
			config.credentialIds.map((id) => `- ${id}`).join('\n');
	}

	// ── Build and run the Agent ───────────────────────────────────────────────
	// Placeholder model — streamFn intercepts all calls so this value is never
	// passed to any real provider.
	const placeholderModel: Model<'openai-completions'> = {
		id: config.modelId || 'proxy',
		name: 'Proxy Model',
		api: 'openai-completions',
		provider: config.modelProvider || 'proxy',
		baseUrl: '',
		reasoning: false,
		input: ['text'],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 4096,
	};

	const agent = new Agent({
		initialState: {
			systemPrompt: effectiveSystemPrompt,
			model: placeholderModel,
			tools,
			messages: agentMessages,
		},
		streamFn,
	});

	// Persist tool results to DB via proxy
	agent.subscribe(async (event) => {
		if (event.type === 'tool_execution_end') {
			logger.debug(
				{ toolName: event.toolName, toolCallId: event.toolCallId },
				'[agent-runner] tool execution end, persisting result',
			);
			const resultContent =
				(event.result as { content?: (TextContent | ImageContent)[] }).content ?? [];
			await proxyClient.appendToolResult({
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				content: resultContent.map((b) => {
					if (b.type === 'text') {
						return { type: 'text' as const, text: (b as TextContent).text };
					}
					return {
						type: 'image' as const,
						data: (b as ImageContent).data,
						mimeType: (b as ImageContent).mimeType,
					};
				}),
			});
		}
	});

	// Start execution
	if (config.triggerType !== 'chat' && config.triggerPayload && agentMessages.length === 0) {
		const triggerText = `Trigger type: ${config.triggerType}\nPayload:\n${JSON.stringify(config.triggerPayload, null, 2)}`;
		logger.info({ triggerType: config.triggerType }, '[agent-runner] starting via trigger prompt');
		await agent.prompt(triggerText);
	} else if (agentMessages.length > 0) {
		logger.info({ messageCount: agentMessages.length }, '[agent-runner] continuing from history');
		await agent.continue();
	}

	await agent.waitForIdle();
	logger.info({ threadId: config.threadId }, '[agent-runner] agent idle — turn complete');
}

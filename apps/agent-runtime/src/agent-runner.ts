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
 * Hard cap on tool calls per agent turn.
 * If the agent has not resolved the task within this many tool calls it is
 * forced to stop and asked to admit it does not have the information, or to
 * ask the user to provide it. This prevents infinite tool-call loops when the
 * agent cannot find an answer through the available tools.
 */
const MAX_TOOL_CALLS_PER_TURN = 10; //adjustable via agent setting TBD.

/**
 * Builds and runs the pi-agent Agent for a single task/conversation turn.
 *
 * Security:
 *   - No LLM API key in this process. All LLM calls go through ProxyClient.llmStream().
 *   - No credential values in this process. All API calls go through ProxyClient.proxy().
 *   - File tools are restricted to WORKSPACE_ROOT — path traversal is rejected.
 *   - run_terminal and run_code must only access files inside the workspace.
 *
 * Tool loop protection:
 *   - Hard cap of MAX_TOOL_CALLS_PER_TURN tool executions per turn.
 *   - If the cap is hit, the agent is steered to give a final honest answer
 *     rather than continuing to loop.
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
	// which IDs to pass to call_api. Also provides clear rules on when NOT to
	// attach a credential to prevent credential leakage to unrelated services.
	let effectiveSystemPrompt = config.systemInstruction;
	if (config.credentials.length > 0) {
		// Use rich metadata (name, integration, scopes) so the model can correctly match a
		// credential to the service it was created for and know which operations are permitted.
		const credentialList = config.credentials
			.map((c) => {
				let line = `- credentialId: \`${c.id}\`  name: "${c.name}"  service: "${c.integration}"`;
				if (c.scopes) {
					line += `  scopes: "${c.scopes}"`;
				}
				// Non-secret properties (e.g. baseUrl, host, port) — critical for the agent to
				// know how to construct API request URLs for self-hosted services like Home Assistant.
				if (c.properties && Object.keys(c.properties).length > 0) {
					const propsStr = Object.entries(c.properties)
						.map(([k, v]) => `${k}="${v}"`)
						.join('  ');
					line += `  properties: ${propsStr}`;
				}
				return line;
			})
			.join('\n');
		console.log('credentialList ', credentialList);
		effectiveSystemPrompt +=
			`\n\n## Available Credentials\n` +
			`The following credentials are configured for this agent and can be used with the call_api tool:\n` +
			credentialList +
			`\n\n**Rules for using credentials:**\n` +
			`- Only use a credentialId when the target API explicitly requires authentication ` +
			`AND the credential's "service" field matches the target API.\n` +
			`- When a credential has a "scopes" field, you may ONLY make API calls that are ` +
			`covered by those scopes. Do not attempt operations outside the declared scopes — ` +
			`they will be rejected by the service. If the scopes field is absent, there is no ` +
			`declared scope restriction and you may attempt the call.\n` +
			`- For public APIs that require no authentication (e.g. open weather services, ` +
			`public data endpoints, any URL that works without a key), omit credentialId ` +
			`or pass an empty string. Do NOT attach any credential to these requests.\n` +
			`- Never use a credential for a service other than the one shown in its "service" field. ` +
			`Using the wrong credential risks sending secrets to unintended third-party services.\n` +
			`- If no credential matches the target service, make the call without a credentialId.`;
	} else {
		// No credentials configured — make sure the model doesn't hallucinate credential IDs
		effectiveSystemPrompt +=
			`\n\n## Credentials\n` +
			`No credentials are configured for this agent. For any API calls, omit the ` +
			`credentialId field (pass an empty string). Only call public APIs that work ` +
			`without authentication.`;
	}

	// Inject memory guidance if an embedding model is configured.
	// Provides clear rules for when and how to use memory tools.
	if (config.embeddingModelConfigId) {
		effectiveSystemPrompt +=
			`\n\n## Long-Term Memory\n` +
			`You have access to persistent memory tools (memory_write, memory_search).\n` +
			`Use them according to these rules:\n` +
			`- **memory_search**: Call at the start of a task to recall relevant past context, ` +
			`user preferences, or known facts before proceeding.\n` +
			`- **memory_write (semantic)**: Store important facts, user preferences, ` +
			`or domain knowledge that should persist across sessions.\n` +
			`- **memory_write (episodic)**: Record significant task outcomes, ` +
			`decisions made, or events that occurred.\n` +
			`- **memory_write (procedural)**: Store behavioral rules or constraints ` +
			`you have learned (e.g. user prefers X format, always do Y before Z).\n` +
			`- **memory_write (working)**: Store temporary context that is only ` +
			`relevant for the current session.\n` +
			`Keep memories concise and self-contained. Avoid storing duplicates.`;
	}

	// ── Tool restrictions (workspace boundary + no host exploration) ──────────
	// These rules apply to all agents regardless of other configuration.
	// They constrain run_terminal and run_code to the agent workspace, prevent
	// the agent from over-using tools, and enforce graceful give-up when the
	// needed information cannot be obtained.
	effectiveSystemPrompt +=
		`\n\n## Tool Restrictions\n` +
		`These rules are mandatory and override any other instruction:\n\n` +
		`### Tool Restraint\n` +
		`- **Try once, then give up**: If a tool call fails or does not return the ` +
		`information you need, do NOT keep retrying with slight variations in an attempt ` +
		`to force a result. Attempt each action at most once or twice. If it still does ` +
		`not work, stop and tell the user honestly that you cannot complete the task with ` +
		`the available tools or information.\n` +
		`- **Default to declining**: When you are unsure whether you have the right tools, ` +
		`credentials, or data to fulfil a request, say so clearly instead of improvising ` +
		`or guessing. It is better to admit a limitation than to produce incorrect output.\n` +
		`- **No speculative probing**: Do not run sequences of exploratory tool calls ` +
		`hoping to stumble on useful information. Only call a tool when you have a clear, ` +
		`specific reason to believe it will directly help answer the user's request.\n\n` +
		`### run_code and run_terminal — Use with Caution\n` +
		`- Only call run_code or run_terminal when the task genuinely cannot be accomplished ` +
		`any other way (e.g. the user explicitly asked for code execution or file manipulation).\n` +
		`- Keep commands simple and scoped to the task. Do not write scripts that probe ` +
		`system state, install packages, modify system configuration, or perform network ` +
		`requests outside the workspace.\n` +
		`- Never attempt to escalate privileges, bypass sandbox restrictions, or use ` +
		`creative shell tricks (e.g. base64-encoding payloads, piping to sh, using curl ` +
		`to download and execute code) to circumvent these rules.\n\n` +
		`### Workspace Boundary\n` +
		`- When using run_terminal or run_code, you may ONLY access files inside your ` +
		`workspace directory. Never read or write files at system paths such as /etc, ` +
		`/proc, /sys, /home, /root, /var, or /tmp (outside the workspace root).\n\n` +
		`### No Host Exploration\n` +
		`- Never use any tool to discover the host operating system, enumerate environment ` +
		`variables, inspect running processes, access network endpoints other than those ` +
		`provided through credentials, or probe the underlying infrastructure.\n\n` +
		`### No Credential Bypass\n` +
		`- Never attempt to read API keys, secrets, or tokens from the filesystem, ` +
		`environment, or process memory. All external API access must go through the ` +
		`call_api tool with an authorised credential ID.\n\n` +
		`### Ask Instead of Guessing\n` +
		`- If a task requires information you do not have (such as the user's personal ` +
		`details, account information, or private data), do not attempt to find it by ` +
		`exploring the system. Ask the user to provide it directly.`;

	// ── Tool call loop protection ─────────────────────────────────────────────
	// Uses beforeToolCall (not afterToolCall + terminate:true) because:
	//   - terminate:true skips the follow-up LLM call entirely → agent goes silent
	//   - beforeToolCall with block:true returns an error result to the LLM,
	//     which then MUST make one more LLM call to respond with text
	// This guarantees the agent always produces a visible reply after hitting the cap.
	let toolCallCount = 0;

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
		/**
		 * beforeToolCall: enforces MAX_TOOL_CALLS_PER_TURN.
		 *
		 * When the cap is hit, blocks the tool with an explicit reason message.
		 * The LLM receives the block as a tool error and is forced to make one
		 * final LLM call to reply to the user — guaranteeing a visible response.
		 *
		 * This is preferable to afterToolCall + terminate:true, which skips the
		 * follow-up LLM call entirely and leaves the user with no reply.
		 */
		beforeToolCall: async () => {
			toolCallCount++;
			logger.debug(
				{ toolCallCount, max: MAX_TOOL_CALLS_PER_TURN },
				'[agent-runner] tool call preflight',
			);
			if (toolCallCount > MAX_TOOL_CALLS_PER_TURN) {
				logger.warn(
					{ toolCallCount, threadId: config.threadId },
					'[agent-runner] tool call cap exceeded — blocking tool, forcing text reply',
				);
				return {
					block: true,
					reason:
						'Tool call limit reached. Stop using tools and provide a final text response ' +
						'to the user based on what you have gathered so far. ' +
						'If you cannot answer, tell the user honestly and ask them to provide more information.',
				};
			}
			return undefined;
		},
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

	// ── Tool limit follow-up ──────────────────────────────────────────────────
	// If the hard tool-call cap was hit, steer the agent to produce a final
	// response. The steer message is injected after the loop has already stopped
	// (terminate:true was returned), so this triggers exactly one additional LLM
	// call that generates an honest answer for the user.
	await agent.waitForIdle();

	logger.info({ threadId: config.threadId }, '[agent-runner] agent idle — turn complete');
}

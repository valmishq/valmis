import { stream, type Model, type UserMessage, type TextContent } from '@earendil-works/pi-ai';
import type { LlmProxyRequest, AgentStreamEvent, SandboxTokenPayload } from '@repo/types';
import { AgentProxyService } from './AgentProxyService.js';
import { LlmProviderService } from './llmProviderService.js';
import { EncryptionService } from './EncryptionService.js';
import { AgentService } from './AgentService.js';
import { AgentStreamBus } from './AgentStreamBus.js';
import { AgentSessionService } from './AgentSessionService.js';
import { AgentMemoryService } from './AgentMemoryService.js';
import { logger } from '../config/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { ContentBlock, MessageTokenUsage } from '@repo/types';
import { resolveProviderApi } from '@repo/utils';
import { LLM_MODELS } from '@repo/models';

/**
 * Handles LLM proxy requests from agent child processes.
 *
 * Security model:
 *   - The child process sends LLM requests to this service (via PROXY_TOKEN auth).
 *   - This service resolves the agent's LLM config, decrypts the API key on the host,
 *     calls the LLM provider, and streams the response back.
 *   - The raw API key never enters the child process.
 *
 * Streaming model:
 *   - pi-ai stream() is called with the decrypted key passed as options.apiKey.
 *   - Each streaming event is emitted on AgentStreamBus (→ SSE to browser).
 *   - The completed assistant message is persisted to agent_messages via AgentSessionService.
 */
export class AgentLlmProxyService {
	constructor(
		private readonly agentProxyService: AgentProxyService,
		private readonly agentService: AgentService,
		private readonly llmProviderService: LlmProviderService,
		private readonly encryptionService: EncryptionService,
		private readonly streamBus: AgentStreamBus,
		private readonly sessionService: AgentSessionService,
		private readonly memoryService: AgentMemoryService,
	) {}

	/**
	 * Execute an LLM completion on behalf of a child process.
	 * Streams events to the AgentStreamBus and persists the final message.
	 *
	 * Returns the full assistant message content for the child to continue its tool loop.
	 */
	async executeStream(proxyToken: string, request: LlmProxyRequest): Promise<unknown[]> {
		// Validate token
		const tokenPayload = await this.agentProxyService.verifyProxyToken(proxyToken);

		logger.debug(
			{ agentId: tokenPayload.agentId, threadId: tokenPayload.threadId },
			'[llm-proxy] received LLM stream request',
		);

		// Resolve agent config and LLM key — apiKey stays on the host
		const { model, apiKey } = await this.resolveModel(tokenPayload);

		const messageId = uuidv4();

		logger.info(
			{
				agentId: tokenPayload.agentId,
				threadId: tokenPayload.threadId,
				messageId,
				provider: model.provider,
				modelId: model.id,
			},
			'[llm-proxy] starting LLM stream',
		);

		// Emit stream_start to browser
		this.streamBus.emit(tokenPayload.threadId, {
			type: 'message_start',
			messageId,
			role: 'assistant',
		});

		// Build pi-ai context
		const context = {
			systemPrompt: request.systemPrompt,
			messages: request.messages as Parameters<typeof stream>[1]['messages'],
			tools: (request.tools as Parameters<typeof stream>[1]['tools']) ?? [],
		};

		logger.debug(
			{
				agentId: tokenPayload.agentId,
				threadId: tokenPayload.threadId,
				messageCount: context.messages.length,
				toolCount: context.tools.length,
			},
			'[llm-proxy] calling pi-ai stream()',
		);

		// Build stream options. apiKey is required so pi-ai doesn't look in env vars.
		const streamOptions: Record<string, unknown> = { apiKey };

		const isGoogle = model.provider.toLowerCase() === 'google';

		// Google Gemini 3.x models require `thoughtSignature` to be echoed back verbatim on
		// every functionCall part when replaying history. pi-ai strips thought_signatures from
		// its event types — they never survive our DB serialisation roundtrip.
		//
		// Fix: use pi-ai's `onPayload` callback to intercept the raw Google API payload before
		// it is sent. Any `functionCall` part in model-role history entries that lacks a
		// `thoughtSignature` gets the bypass sentinel value that Google officially documents:
		//   "skip_thought_signature_validator"
		// This tells the Google API to skip signature validation for that part.
		// Reference: https://ai.google.dev/gemini-api/docs/thought-signatures (FAQ section)
		if (isGoogle) {
			streamOptions.onPayload = (payload: unknown) => {
				const p = payload as { contents?: unknown[] };
				if (!Array.isArray(p.contents)) return;

				for (const contentEntry of p.contents) {
					const entry = contentEntry as { role?: string; parts?: unknown[] };
					// Only patch model-role entries (assistant messages in replay history)
					if (entry.role !== 'model') continue;
					if (!Array.isArray(entry.parts)) continue;

					for (const part of entry.parts) {
						const partObj = part as {
							functionCall?: unknown;
							thoughtSignature?: string;
						};
						// Inject bypass sentinel on functionCall parts that have no signature
						if (partObj.functionCall !== undefined && !partObj.thoughtSignature) {
							partObj.thoughtSignature = 'skip_thought_signature_validator';
						}
					}
				}
			};
		}

		logger.debug(
			{
				agentId: tokenPayload.agentId,
				isGoogle,
				modelReasoning: model.reasoning,
				toolCount: context.tools.length,
				streamOptionsKeys: Object.keys(streamOptions),
				// Log role + content-block types for every message sent to the LLM
				messagesSummary: context.messages.map((m, i) => {
					const msg = m as { role: string; content?: unknown[] };
					const contentTypes = Array.isArray(msg.content)
						? msg.content.map((b) => (b as { type: string }).type)
						: [];
					return { index: i, role: msg.role, contentTypes };
				}),
			},
			'[llm-proxy] stream options + message summary',
		);

		const piStream = stream(model, context, streamOptions);

		// Collect content blocks for persistence and return
		const contentBlocks: ContentBlock[] = [];
		let currentTextBlock: { type: 'text'; text: string } | null = null;

		for await (const event of piStream) {
			switch (event.type) {
				case 'text_start':
					currentTextBlock = { type: 'text', text: '' };
					break;

				case 'text_delta':
					if (currentTextBlock) {
						currentTextBlock.text += event.delta;
					}
					logger.debug(
						{ agentId: tokenPayload.agentId, messageId, delta: event.delta },
						'[llm-proxy] text_delta',
					);
					this.streamBus.emit(tokenPayload.threadId, {
						type: 'text_delta',
						messageId,
						delta: event.delta,
					});
					break;

				case 'text_end':
					if (currentTextBlock) {
						contentBlocks.push(currentTextBlock);
						currentTextBlock = null;
					}
					break;

				case 'thinking_delta':
					this.streamBus.emit(tokenPayload.threadId, {
						type: 'thinking_delta',
						messageId,
						delta: event.delta,
					});
					break;

				case 'toolcall_start':
					// Emit a placeholder start event using the content index as a temporary ID.
					// The real toolCallId and toolName are not yet known — they arrive at toolcall_end.
					this.streamBus.emit(tokenPayload.threadId, {
						type: 'tool_call_start',
						messageId,
						toolCallId: String(event.contentIndex),
						toolName: '',
					});
					break;

				case 'toolcall_end': {
					const toolCall = event.toolCall;
					contentBlocks.push({
						type: 'toolCall',
						id: toolCall.id,
						name: toolCall.name,
						arguments: toolCall.arguments as Record<string, unknown>,
					});
					logger.debug(
						{ agentId: tokenPayload.agentId, toolName: toolCall.name, toolCallId: toolCall.id },
						'[llm-proxy] tool call emitted',
					);
					// Emit tool_call_delta to update the placeholder with real id, name, and args.
					// The frontend uses placeholderId to replace the earlier tool_call_start entry.
					this.streamBus.emit(tokenPayload.threadId, {
						type: 'tool_call_delta',
						messageId,
						placeholderId: String(event.contentIndex),
						toolCallId: toolCall.id,
						toolName: toolCall.name,
						argsJson: JSON.stringify(toolCall.arguments, null, 2),
					});
					break;
				}

				case 'done': {
					const finalMsg = event.message;
					const usage: MessageTokenUsage | undefined = finalMsg.usage
						? {
								input: finalMsg.usage.input,
								output: finalMsg.usage.output,
								cost: { total: finalMsg.usage.cost?.total ?? 0 },
							}
						: undefined;

					// Persist the completed assistant message.
					// Wrapped in try/catch so a DB failure doesn't leave the browser in a
					// permanently-locked state — we still emit message_end so the UI unlocks,
					// then re-throw so the child process receives a 500 and exits with code 1.
					try {
						await this.sessionService.appendMessage({
							threadId: tokenPayload.threadId,
							role: 'assistant',
							content: contentBlocks,
							tokenUsage: usage,
						});

						// Accumulate context window tokens (input + output) for this turn.
						// Both input and output tokens count toward context size because output
						// from this turn becomes input context on the next turn.
						// When a compaction feature is added, this value can be reset/reduced
						// independently of the total token/cost metrics.
						if (usage) {
							await this.sessionService.accumulateThreadContextTokens(
								tokenPayload.threadId,
								usage.input + usage.output,
							);
						}

						logger.info(
							{
								agentId: tokenPayload.agentId,
								threadId: tokenPayload.threadId,
								messageId,
								contentBlocks: contentBlocks.length,
								usage,
							},
							'[llm-proxy] LLM stream done, assistant message persisted',
						);
					} catch (persistErr) {
						logger.error(
							{ persistErr, threadId: tokenPayload.threadId, messageId },
							'[llm-proxy] failed to persist assistant message — emitting message_end anyway',
						);
						// Emit message_end before re-throwing so the browser SSE handler can
						// unlock the input (avoids the UI freezing on a transient DB error).
						this.streamBus.emit(tokenPayload.threadId, {
							type: 'message_end',
							messageId,
							usage,
						});
						throw persistErr;
					}

					this.streamBus.emit(tokenPayload.threadId, {
						type: 'message_end',
						messageId,
						usage,
					});
					break;
				}

				case 'error':
					logger.error(
						{ agentId: tokenPayload.agentId, error: event.error.errorMessage },
						'[llm-proxy] LLM stream error',
					);
					this.streamBus.emit(tokenPayload.threadId, {
						type: 'error',
						message: event.error.errorMessage ?? 'LLM stream error',
					});
					break;
			}
		}

		// Return the collected content blocks so the child process can continue its tool loop
		return contentBlocks;
	}

	/**
	 * Generate a short title (≤10 words) for a thread based on the first two messages.
	 * Uses the same model configured for the agent. Runs non-blocking — failure is silently
	 * logged and does not affect the ongoing agent turn.
	 *
	 * @param threadId   - The thread to update
	 * @param ownerId    - Owner, required for session service auth check
	 * @param agentId    - Agent whose LLM config to use
	 * @param firstUserMsg  - The first user message text
	 * @param secondUserMsg - The second user message text
	 */
	async generateThreadTitle(
		threadId: string,
		ownerId: string,
		agentId: string,
		firstUserMsg: string,
		secondUserMsg: string,
	): Promise<string | null> {
		try {
			// Build a minimal sandbox token payload for resolveModel
			const fakePayload: import('@repo/types').SandboxTokenPayload = {
				agentId,
				ownerId,
				threadId,
				credentialIds: [],
				iat: Math.floor(Date.now() / 1000),
				exp: Math.floor(Date.now() / 1000) + 60,
			};

			const { model, apiKey } = await this.resolveModel(fakePayload);

			const prompt =
				`Based on these two messages from a conversation, generate a concise title of at most 10 words.\n` +
				`Reply with ONLY the title — no punctuation at the end, no quotes.\n\n` +
				`Message 1: ${firstUserMsg}\n` +
				`Message 2: ${secondUserMsg}`;

			const titleUserMsg: UserMessage = {
				role: 'user',
				content: [{ type: 'text', text: prompt } as TextContent],
				timestamp: Date.now(),
			};

			const titleStream = stream(
				model,
				{
					systemPrompt: 'You generate short conversation titles.',
					messages: [titleUserMsg],
					tools: [],
				},
				{ apiKey },
			);

			let title = '';
			let titleUsage: MessageTokenUsage | undefined;
			for await (const event of titleStream) {
				if (event.type === 'text_delta') {
					title += event.delta;
				}
				if (event.type === 'done' && event.message.usage) {
					titleUsage = {
						input: event.message.usage.input,
						output: event.message.usage.output,
						cost: { total: event.message.usage.cost?.total ?? 0 },
					};
				}
			}

			// Trim whitespace and cap at 10 words as a safety measure
			title = title
				.trim()
				.replace(/[.!?]+$/, '')
				.split(/\s+/)
				.slice(0, 10)
				.join(' ');

			if (!title) return null;

			// Persist title generation usage to the thread so it counts toward cost.
			// Stored as an assistant message with no visible content (empty text block).
			// This ensures the run page and chat bar both account for this LLM call.
			if (titleUsage) {
				await this.sessionService.appendMessage({
					threadId,
					role: 'assistant',
					content: [{ type: 'text', text: '' }],
					tokenUsage: titleUsage,
				});
			}

			await this.sessionService.updateThreadTitle(threadId, ownerId, title);

			logger.info({ threadId, title, titleUsage }, '[llm-proxy] generated thread title');
			return title;
		} catch (err) {
			// Non-fatal — title generation is best-effort
			logger.warn({ err, threadId }, '[llm-proxy] thread title generation failed');
			return null;
		}
	}

	/**
	 * Summarise the user messages from a previous thread and write the summary as a
	 * semantic memory entry for the agent. Called fire-and-forget when a new thread
	 * is created so the agent "remembers" what was discussed in the previous session.
	 *
	 * Only user messages are sent to the LLM for summarisation — assistant messages,
	 * tool calls, and tool results are excluded. This keeps the context concise and
	 * avoids leaking internal execution details into long-term memory.
	 *
	 * Silently no-ops if:
	 *   - The previous thread has no user messages
	 *   - The agent has no LLM model configured
	 *   - The agent has no embedding model configured (memory write would fail)
	 *
	 * @param agentId          - Agent whose memory to write to
	 * @param ownerId          - Owner required for DB queries and auth
	 * @param prevThreadId     - The thread to summarise (the most recently created before newThreadId)
	 */
	async summarizeThreadToMemory(
		agentId: string,
		ownerId: string,
		prevThreadId: string,
	): Promise<void> {
		try {
			// Load user messages from the previous thread only
			const messages = await this.sessionService.listMessagesInternal(prevThreadId);
			const userMessages = messages.filter((m) => m.role === 'user');

			if (userMessages.length === 0) {
				logger.debug(
					{ agentId, prevThreadId },
					'[llm-proxy] summarize: no user messages in previous thread — skipping',
				);
				return;
			}

			// Build a readable transcript from user messages only
			const transcript = userMessages
				.map((m, idx) => {
					const textBlocks = m.content.filter(
						(b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text',
					);
					const text = textBlocks
						.map((b) => b.text)
						.join(' ')
						.trim();
					return text ? `User message ${idx + 1}: ${text}` : null;
				})
				.filter((line): line is string => line !== null)
				.join('\n');

			if (!transcript) {
				logger.debug(
					{ agentId, prevThreadId },
					'[llm-proxy] summarize: all user messages were empty — skipping',
				);
				return;
			}

			// Build a minimal fake token payload so resolveModel can fetch agent config
			const fakePayload: import('@repo/types').SandboxTokenPayload = {
				agentId,
				ownerId,
				threadId: prevThreadId,
				credentialIds: [],
				iat: Math.floor(Date.now() / 1000),
				exp: Math.floor(Date.now() / 1000) + 120,
			};

			const { model, apiKey } = await this.resolveModel(fakePayload);

			const summaryPrompt =
				`The following are user messages from a conversation session. ` +
				`Summarise the most important facts, preferences, goals, and topics discussed. ` +
				`Be concise. Focus on information that would be useful to remember in future sessions. Omit not important things. This is only for storing important facts about the user. There is no need to log trivia or anything that won't be useful in the future.` +
				`Do NOT mention that this is a summary — write as plain factual statements.\n\n` +
				transcript;

			const summaryUserMsg: UserMessage = {
				role: 'user',
				content: [{ type: 'text', text: summaryPrompt } as TextContent],
				timestamp: Date.now(),
			};

			const summaryStream = stream(
				model,
				{
					systemPrompt:
						'You extract and summarise the most important information from conversation transcripts.',
					messages: [summaryUserMsg],
					tools: [],
				},
				{ apiKey },
			);

			let summary = '';
			for await (const event of summaryStream) {
				if (event.type === 'text_delta') {
					summary += event.delta;
				}
			}

			summary = summary.trim();
			if (!summary) {
				logger.debug(
					{ agentId, prevThreadId },
					'[llm-proxy] summarize: LLM returned empty summary — skipping memory write',
				);
				return;
			}

			// Write the summary as a semantic memory entry
			await this.memoryService.writeMemory(agentId, ownerId, {
				content: summary,
				memoryType: 'semantic',
				metadata: { source: 'thread_summary', threadId: prevThreadId },
			});

			logger.info(
				{ agentId, prevThreadId, summaryLength: summary.length },
				'[llm-proxy] thread summarized and stored as semantic memory',
			);
		} catch (err) {
			// Non-fatal — thread summarization is best-effort and must not block thread creation
			logger.warn(
				{ err, agentId, prevThreadId },
				'[llm-proxy] thread summarization failed (non-fatal)',
			);
		}
	}

	/**
	 * Resolve the pi-ai Model and decrypted API key for an agent.
	 * The apiKey is returned separately — never stored on the model object —
	 * to make it clear that it must be passed explicitly to stream() options.
	 */
	private async resolveModel(
		tokenPayload: SandboxTokenPayload,
	): Promise<{ model: Model<string>; apiKey: string }> {
		const agent = await this.agentService.getById(tokenPayload.agentId, tokenPayload.ownerId);
		if (!agent) {
			throw new Error(`Agent not found: ${tokenPayload.agentId}`);
		}
		if (!agent.modelConfigId) {
			throw new Error(`Agent ${tokenPayload.agentId} has no model configured`);
		}

		const config = await this.llmProviderService.getById(agent.modelConfigId, tokenPayload.ownerId);
		if (!config) {
			throw new Error(`LLM config not found: ${agent.modelConfigId}`);
		}

		const secretData = await this.llmProviderService.getDecryptedData(
			agent.modelConfigId,
			tokenPayload.ownerId,
		);
		if (!secretData) {
			throw new Error(`Could not decrypt LLM config for agent ${tokenPayload.agentId}`);
		}

		logger.debug(
			{ agentId: tokenPayload.agentId, provider: config.provider, model: config.model },
			'[llm-proxy] resolved model config',
		);

		// Map the stored provider string to the pi-ai API identifier using the shared
		// utility from @repo/utils. Centralising the map in one place ensures agent-runner
		// and this service always agree on the api field of AssistantMessage.
		const api = resolveProviderApi(config.provider);

		// Catalog model IDs use OpenRouter-style "{provider}/{model}" slugs (e.g. "google/gemini-2.5-flash").
		// Native provider APIs (Google, Anthropic, OpenAI, Mistral) expect the bare model name only.
		// Manual entries without a slash (e.g. "gpt-4o") pass through unchanged.
		const nativeModelId = config.model.includes('/')
			? config.model.split('/').slice(1).join('/')
			: config.model;

		// Look up catalog pricing and context window for accurate cost tracking.
		// Try exact match first (catalog uses "provider/model" slugs like "openai/gpt-4o").
		// Fall back to bare model name match for agents configured without the provider prefix
		// (e.g. model stored as "gpt-4o" → matches catalog entry "openai/gpt-4o").
		const catalogEntry =
			LLM_MODELS.find((m) => m.id === config.model) ??
			LLM_MODELS.find((m) => m.id.endsWith('/' + config.model));

		// IMPORTANT: The catalog stores pricing as cost-per-single-token (e.g. 0.000003).
		// pi-ai expects cost-per-MILLION-tokens (e.g. 3.0).
		// Multiply by 1_000_000 to convert.
		const perMillion = (raw: string | undefined): number => {
			if (!raw) return 0;
			const v = parseFloat(raw);
			return isNaN(v) ? 0 : v * 1_000_000;
		};
		const contextWindow = catalogEntry?.contextLength ?? 128000;

		const model: Model<string> = {
			id: nativeModelId,
			api,
			provider: config.provider,
			name: config.model,
			reasoning: false,
			input: ['text'],
			cost: {
				input: perMillion(catalogEntry?.pricing.promptPerToken),
				output: perMillion(catalogEntry?.pricing.completionPerToken),
				cacheRead: perMillion(catalogEntry?.pricing.cacheReadPerToken),
				cacheWrite: perMillion(catalogEntry?.pricing.cacheWritePerToken),
			},
			contextWindow,
			maxTokens: 4096,
			baseUrl: secretData.baseUrl ?? '',
		};

		return { model, apiKey: secretData.apiKey };
	}
}

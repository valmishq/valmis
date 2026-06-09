import { Agent, type StreamFn } from '@earendil-works/pi-agent-core';
import {
	type Model,
	type TextContent,
	type ImageContent,
	type AssistantMessage,
	type ToolCall,
	type Context,
	type Usage,
	createAssistantMessageEventStream,
} from '@earendil-works/pi-ai';
import type { AgentRuntimeConfig, LlmProxyRequest, WorkflowStep } from '@repo/types';
import { logger, resolveProviderApi } from '@repo/utils';
import { ProxyClient } from './proxy-client.js';
import { createAgentTools } from './tools/index.js';

/** Default max tool calls per step if not set on the step definition */
const DEFAULT_MAX_TOOL_CALLS_PER_STEP = 20;

/** Zero-value Usage for placeholder AssistantMessage returned by streamFn */
const zeroUsage: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? '/workspace';

// ─── Input mapping resolution ─────────────────────────────────────────────────

/**
 * Resolve a step's inputMapping template against available context variables.
 * Supported variables:
 *   {{trigger.payload}}      — the raw trigger payload (JSON)
 *   {{steps.<index>.output}} — the outputData of a prior step (JSON)
 * If inputMapping is absent, returns a default context string.
 */
function resolveInputMapping(
	step: WorkflowStep,
	stepIndex: number,
	triggerPayloadJson: string,
	stepOutputs: Record<number, Record<string, unknown>>,
): string {
	const vars: Record<string, string> = {
		'trigger.payload': triggerPayloadJson,
	};
	for (const [idx, output] of Object.entries(stepOutputs)) {
		vars[`steps.${idx}.output`] = JSON.stringify(output, null, 2);
	}

	if (step.inputMapping) {
		return step.inputMapping.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
			return vars[key.trim()] ?? `{{${key}}}`;
		});
	}

	if (stepIndex === 0) {
		return `## Trigger Payload\n${triggerPayloadJson}`;
	}
	const prevOutput = stepOutputs[stepIndex - 1];
	return prevOutput
		? `## Input from Previous Step (Step ${stepIndex})\n${JSON.stringify(prevOutput, null, 2)}`
		: '';
}

// ─── System prompt building ───────────────────────────────────────────────────

function buildStepSystemPrompt(
	config: AgentRuntimeConfig,
	step: WorkflowStep,
	inputContext: string,
): string {
	const workflow = config.workflow!;
	const { triggerContext } = workflow;
	const now = new Date().toISOString();

	let prompt =
		`## Workflow Execution\n` +
		`You are executing step **${step.name}** of the workflow.\n` +
		`Triggered by: ${triggerContext.triggerName} (${triggerContext.type})\n` +
		`Trigger time: ${triggerContext.firedAt}\n` +
		`Current server time: ${now}\n\n` +
		`## Agent Instructions\n${config.systemInstruction}\n\n` +
		`## Step Instruction\n${step.instruction}\n\n` +
		`## Step Input\n${inputContext}`;

	// Schema mode — require JSON output
	if (step.expectedResponseSchema) {
		prompt +=
			`\n\n## Required Output Format\n` +
			`You MUST respond with a valid JSON object that strictly conforms to this schema:\n` +
			`\`\`\`json\n${JSON.stringify(step.expectedResponseSchema, null, 2)}\n\`\`\`\n` +
			`Return ONLY the JSON object with no other text, no markdown fences, no explanation.`;
	}

	// Credential guidance — filtered to this step's allowedCredentialIds
	const effectiveCredentials =
		step.allowedCredentialIds.length > 0
			? config.credentials.filter((c) => step.allowedCredentialIds.includes(c.id))
			: config.credentials;

	if (effectiveCredentials.length > 0) {
		const credList = effectiveCredentials
			.map((c) => {
				let line = `- credentialId: \`${c.id}\`  name: "${c.name}"  service: "${c.integration}"`;
				if (c.scopes) line += `  scopes: "${c.scopes}"`;
				if (c.properties && Object.keys(c.properties).length > 0) {
					const propsStr = Object.entries(c.properties)
						.map(([k, v]) => `${k}="${v}"`)
						.join('  ');
					line += `  properties: ${propsStr}`;
				}
				return line;
			})
			.join('\n');

		prompt +=
			`\n\n## Available Credentials (this step)\n` +
			`The following credentials are available for this step via the call_api tool:\n` +
			credList +
			`\n\nOnly use a credential when the target API requires authentication and the service field matches.`;
	} else {
		prompt += `\n\n## Credentials\nNo credentials are available for this step. Use public APIs only (pass empty credentialId).`;
	}

	return prompt;
}

// ─── Execute a single step ────────────────────────────────────────────────────

/**
 * Execute one workflow step as a full pi-agent turn (prompt → tool loop → final reply).
 *
 * The final text is captured directly from the content blocks returned by the LLM proxy
 * on the last assistant turn (not via getState — pi-agent does not expose getState).
 *
 * Returns:
 *   - Parsed JSON object when expectedResponseSchema is set and the LLM output is valid JSON.
 *   - { text: string } for free-text steps.
 *
 * Throws on failure (caller handles retry / error propagation).
 */
async function executeStep(
	step: WorkflowStep,
	config: AgentRuntimeConfig,
	proxyClient: ProxyClient,
	stepPrompt: string,
): Promise<Record<string, unknown>> {
	const resolvedApi = resolveProviderApi(config.modelProvider ?? '');
	const maxToolCalls = step.maxToolCallsPerStep ?? DEFAULT_MAX_TOOL_CALLS_PER_STEP;

	// Filter tools to step-allowed subset (empty = all tools)
	const allTools = createAgentTools({ proxyClient, workspaceRoot: WORKSPACE_ROOT });
	const effectiveTools =
		step.allowedTools.length > 0
			? allTools.filter((t) => step.allowedTools.includes(t.name))
			: allTools;

	// Capture the final text from the last LLM call in this step.
	// We use a mutable reference updated on every LLM call; the last one wins.
	let lastFinalText = '';

	const streamFn: StreamFn = (model, context) => {
		const ctx = context as Context;
		const request: LlmProxyRequest = {
			messages: ctx.messages,
			systemPrompt: ctx.systemPrompt ?? stepPrompt,
			tools: ctx.tools,
		};

		const eventStream = createAssistantMessageEventStream();

		proxyClient
			.llmStream(request)
			.then((contentBlocks) => {
				// Capture the final text from this LLM call
				lastFinalText = contentBlocks
					.filter((b) => b.type === 'text')
					.map((b) => (b as TextContent).text)
					.join('\n');

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

	let toolCallCount = 0;

	const agent = new Agent({
		initialState: {
			systemPrompt: stepPrompt,
			model: placeholderModel,
			tools: effectiveTools,
			messages: [], // fresh context per step — each step is an independent turn
		},
		streamFn,
		beforeToolCall: async () => {
			toolCallCount++;
			if (toolCallCount > maxToolCalls) {
				logger.warn(
					{ toolCallCount, stepId: step.id, stepName: step.name },
					'[workflow-runner] tool call cap exceeded for step',
				);
				return {
					block: true,
					reason:
						'Tool call limit reached for this step. Provide a final answer based on gathered information.',
				};
			}
			return undefined;
		},
	});

	// Persist tool results to the thread via proxy
	agent.subscribe(async (event) => {
		if (event.type === 'tool_execution_end') {
			const resultContent =
				(event.result as { content?: (TextContent | ImageContent)[] }).content ?? [];
			await proxyClient.appendToolResult({
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				content: resultContent.map((b) => {
					if (b.type === 'text') return { type: 'text' as const, text: (b as TextContent).text };
					return {
						type: 'image' as const,
						data: (b as ImageContent).data,
						mimeType: (b as ImageContent).mimeType,
					};
				}),
			});
		}
	});

	await agent.prompt(`Execute the following task:\n\n${stepPrompt}`);
	await agent.waitForIdle();

	// The final text is whatever was captured by the last LLM call in the tool loop
	const finalText = lastFinalText;

	// Parse JSON if schema was expected
	if (step.expectedResponseSchema && finalText.trim()) {
		try {
			const parsed = JSON.parse(finalText.trim()) as Record<string, unknown>;
			return parsed;
		} catch {
			logger.warn(
				{ stepId: step.id, stepName: step.name },
				'[workflow-runner] step output is not valid JSON despite expectedResponseSchema',
			);
			throw new Error(
				`Step "${step.name}" output is not valid JSON. Output was: ${finalText.slice(0, 200)}`,
			);
		}
	}

	return { text: finalText };
}

// ─── Main workflow runner ─────────────────────────────────────────────────────

/**
 * Executes a full workflow pipeline for a non-chat trigger.
 *
 * For each step:
 *   1. Resolve input context via inputMapping templates.
 *   2. Build step system prompt (instruction + credentials + schema requirement).
 *   3. Log step start via proxyClient.logWorkflowStepStart().
 *   4. Run a full pi-agent loop for the step (prompt → tool calls → final reply).
 *   5. On success: log step completion, store output for next step.
 *   6. On failure: apply step.errorHandling (retry / continue / stop).
 * When all steps complete: call proxyClient.completeWorkflowRun('completed').
 * On fatal error: call proxyClient.completeWorkflowRun('error', message).
 */
export async function runWorkflow(
	config: AgentRuntimeConfig,
	proxyClient: ProxyClient,
): Promise<void> {
	const { workflow } = config;
	if (!workflow) {
		throw new Error('[workflow-runner] runWorkflow called but config.workflow is absent');
	}

	const { runId, definition, triggerContext } = workflow;
	const triggerPayloadJson = JSON.stringify(triggerContext.payload, null, 2);

	// stepOutputs[stepIndex] = parsed output of that step (for inputMapping of later steps)
	const stepOutputs: Record<number, Record<string, unknown>> = {};

	logger.info(
		{ runId, workflowId: definition.id, stepCount: definition.steps.length },
		'[workflow-runner] starting workflow',
	);

	for (let stepIndex = 0; stepIndex < definition.steps.length; stepIndex++) {
		const step = definition.steps[stepIndex];
		const inputContext = resolveInputMapping(step, stepIndex, triggerPayloadJson, stepOutputs);

		logger.info(
			{ runId, stepId: step.id, stepName: step.name, stepIndex },
			'[workflow-runner] executing step',
		);

		// Log step start — returns a stepLogId for subsequent completion calls
		const stepLogId = await proxyClient.logWorkflowStepStart({
			runId,
			stepId: step.id,
			stepIndex,
			stepName: step.name,
			inputContext: { instruction: step.instruction, input: inputContext },
		});

		const stepPrompt = buildStepSystemPrompt(config, step, inputContext);

		const maxRetries =
			step.errorHandling.action === 'retry' ? (step.errorHandling.maxRetries ?? 1) : 0;
		let lastError: Error | null = null;
		let succeeded = false;
		let stepOutput: Record<string, unknown> = {};
		// Track the current log ID (may change between retry attempts)
		let currentLogId = stepLogId;

		for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
			try {
				stepOutput = await executeStep(step, config, proxyClient, stepPrompt);
				succeeded = true;
				lastError = null;
				break;
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				logger.warn(
					{ runId, stepId: step.id, stepName: step.name, attempt, err: lastError.message },
					'[workflow-runner] step attempt failed',
				);

				if (attempt <= maxRetries) {
					// Close the current attempt log as failed
					await proxyClient.logWorkflowStepEnd({
						stepLogId: currentLogId,
						status: 'failed',
						error: `Attempt ${attempt} failed: ${lastError.message}. Retrying...`,
					});
					// Open a new log row for the retry attempt
					currentLogId = await proxyClient.logWorkflowStepStart({
						runId,
						stepId: step.id,
						stepIndex,
						stepName: step.name,
						inputContext: { instruction: step.instruction, input: inputContext },
						attemptNumber: attempt + 1,
					});
				}
			}
		}

		if (succeeded) {
			stepOutputs[stepIndex] = stepOutput;
			await proxyClient.logWorkflowStepEnd({
				stepLogId: currentLogId,
				status: 'success',
				outputData: stepOutput,
			});
			logger.info(
				{ runId, stepId: step.id, stepName: step.name },
				'[workflow-runner] step completed',
			);
		} else {
			const errorMessage = lastError?.message ?? 'Unknown error';

			if (
				step.errorHandling.action === 'continue' ||
				step.errorHandling.fallbackAction === 'continue'
			) {
				// Mark failed but continue pipeline
				await proxyClient.logWorkflowStepEnd({
					stepLogId: currentLogId,
					status: 'failed',
					error: errorMessage,
				});
				logger.warn(
					{ runId, stepId: step.id, stepName: step.name },
					'[workflow-runner] step failed — continuing (errorHandling.action=continue)',
				);
				stepOutputs[stepIndex] = { error: errorMessage };
			} else {
				// Stop the workflow — mark remaining steps as skipped
				await proxyClient.logWorkflowStepEnd({
					stepLogId: currentLogId,
					status: 'failed',
					error: errorMessage,
				});

				for (let i = stepIndex + 1; i < definition.steps.length; i++) {
					const skippedStep = definition.steps[i];
					const skippedLogId = await proxyClient.logWorkflowStepStart({
						runId,
						stepId: skippedStep.id,
						stepIndex: i,
						stepName: skippedStep.name,
						inputContext: {},
					});
					await proxyClient.logWorkflowStepEnd({ stepLogId: skippedLogId, status: 'skipped' });
				}

				await proxyClient.completeWorkflowRun({
					runId,
					status: 'error',
					error: `Step "${step.name}" failed: ${errorMessage}`,
				});
				logger.error(
					{ runId, stepId: step.id, stepName: step.name, errorMessage },
					'[workflow-runner] workflow stopped due to step failure',
				);
				return;
			}
		}
	}

	// All steps complete
	await proxyClient.completeWorkflowRun({ runId, status: 'completed' });
	logger.info({ runId, workflowId: definition.id }, '[workflow-runner] workflow completed');
}

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
import type {
	AgentRuntimeConfig,
	LlmProxyRequest,
	WorkflowStep,
	WorkflowNode,
	WorkflowEdge,
	WorkflowAgentNode,
	WorkflowConditionNode,
	WorkflowLoopNode,
} from '@repo/types';
import { logger, resolveProviderApi, ensureGraph, graphToSteps, evalFilter } from '@repo/utils';
import { ProxyClient } from './proxy-client.js';
import { createAgentTools } from './tools/index.js';
import { buildSkillsPromptSection } from './prompt-sections.js';
import { recordSkillTraces, type ToolLogEntry } from './skill-trace.js';
import { validateJsonSchema } from './json-schema.js';

/** Run-level skill activation tracking shared across all steps of a workflow */
interface SkillTracker {
	activatedSkills: Set<string>;
	toolLog: ToolLogEntry[];
	toolCallCount: number;
}

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

// ─── Run context ──────────────────────────────────────────────────────────────

/**
 * Shared state threaded through graph traversal and node executors. Outputs are
 * keyed by node id (authoritative); a parallel index map keeps the legacy
 * {{steps.<index>.output}} template alias resolving for older workflows.
 */
interface RunContext {
	config: AgentRuntimeConfig;
	proxyClient: ProxyClient;
	runId: string;
	triggerPayloadJson: string;
	/** Raw trigger payload object, for dotted-path resolution ({{trigger.payload.x}}). */
	triggerPayload: Record<string, unknown>;
	nodeById: Map<string, WorkflowNode>;
	outgoing: (id: string) => WorkflowEdge[];
	incoming: (id: string) => WorkflowEdge[];
	outputsByNode: Record<string, Record<string, unknown>>;
	/** Agent node ids in linear order — backs the legacy {{steps.<index>.output}} alias. */
	orderedAgentIds: string[];
	skillTracker: SkillTracker;
	triggerNodeId: string;
	/** Active loop frame ({{loop.item}} / {{loop.index}}); null when not looping. */
	loopFrame: { item: unknown; index: number } | null;
	/** Nodes that actually executed in this run (across the main graph and loop bodies). */
	visited: Set<string>;
	/** Nodes that were resolved-as-skipped and already logged (so the sweep won't double-log). */
	skipped: Set<string>;
	/** Monotonic execution-order counter used as the step log's stepIndex. */
	nextOrder: () => number;
}

/** Result of executing one node: continue along `nextHandles`, or stop the run. */
type NodeExecResult = { status: 'ok'; nextHandles: string[] } | { status: 'stop'; error: string };

// ─── Input mapping resolution ─────────────────────────────────────────────────

/** Walk a dotted path into a value; undefined if any segment is missing. */
function walkPath(value: unknown, path: string[]): unknown {
	let current: unknown = value;
	for (const seg of path) {
		if (current === null || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[seg];
	}
	return current;
}

/** Stringify a resolved value for substitution: strings as-is, objects/arrays as JSON. */
function stringifyValue(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return JSON.stringify(value, null, 2);
}

/**
 * Resolve one template variable against the run context. Supports dotted sub-paths:
 *   {{trigger.payload}} / {{trigger.payload.a.b}}
 *   {{steps.<nodeId>.output}} / {{steps.<nodeId>.output.a.b}}
 *   {{steps.<index>.output...}} — legacy linear-index alias (older workflows)
 *   {{loop.item}} / {{loop.item.a.b}} / {{loop.index}}
 * Returns undefined when the variable/path can't be resolved (the ref is left intact).
 */
function resolveVar(key: string, ctx: RunContext): string | undefined {
	const segments = key.split('.');

	if (segments[0] === 'trigger' && segments[1] === 'payload') {
		return stringifyValue(walkPath(ctx.triggerPayload, segments.slice(2)));
	}

	if (segments[0] === 'loop' && ctx.loopFrame) {
		if (segments[1] === 'index') return String(ctx.loopFrame.index);
		if (segments[1] === 'item') {
			return stringifyValue(walkPath(ctx.loopFrame.item, segments.slice(2)));
		}
		return undefined;
	}

	if (segments[0] === 'steps' && segments[2] === 'output') {
		const ref = segments[1];
		let output: Record<string, unknown> | undefined = ctx.outputsByNode[ref];
		if (!output) {
			// Legacy index alias: steps.<index>.output → the agent node at that position.
			const idx = Number(ref);
			if (Number.isInteger(idx)) {
				const nodeId = ctx.orderedAgentIds[idx];
				if (nodeId) output = ctx.outputsByNode[nodeId];
			}
		}
		if (!output) return undefined;
		return stringifyValue(walkPath(output, segments.slice(3)));
	}

	return undefined;
}

/** Substitute {{var}} references in a template; unknown vars/paths are left intact. */
function applyTemplate(template: string, ctx: RunContext): string {
	return template.replace(
		/\{\{([^}]+)\}\}/g,
		(_, key: string) => resolveVar(key.trim(), ctx) ?? `{{${key}}}`,
	);
}

/** Resolve an arbitrary template string against the current run context. */
function resolveTemplate(template: string, ctx: RunContext): string {
	return applyTemplate(template, ctx);
}

/**
 * Build the full prior-results context: the trigger payload plus the RESULT of every
 * node that has executed so far (agent steps, conditions, loops) — their outputs only,
 * never their internal tool calls. Categorized by step index, name, node type and id,
 * so each agent sees what has happened in the whole workflow so far. `outputsByNode`
 * preserves completion order (UUID keys), giving a stable per-node "step index".
 */
function buildPriorResultsText(ctx: RunContext): string {
	const parts: string[] = [`### Trigger\n${ctx.triggerPayloadJson}`];
	let index = 1;
	for (const [nodeId, output] of Object.entries(ctx.outputsByNode)) {
		const node = ctx.nodeById.get(nodeId);
		const type = node?.type ?? 'unknown';
		const name = node && node.type !== 'trigger' ? node.data.name || node.type : type;
		parts.push(
			`### Step ${index} — "${name}" (type: ${type}, id: ${nodeId})\n${JSON.stringify(output, null, 2)}`,
		);
		index++;
	}
	return (
		`Results of all previous steps so far (their outputs only — not their internal tool calls):\n\n` +
		parts.join('\n\n')
	);
}

/**
 * Resolve a step's input. A custom inputMapping template fully replaces the context;
 * otherwise the step receives the results of ALL previous steps (buildPriorResultsText).
 */
function resolveInputMapping(step: WorkflowStep, ctx: RunContext): string {
	if (step.inputMapping) {
		return applyTemplate(step.inputMapping, ctx);
	}
	return buildPriorResultsText(ctx);
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

	// Skill index (progressive disclosure) — same section as agent-runner so
	// workflow steps can use assigned skills too.
	prompt += buildSkillsPromptSection(config.skills);

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
	skillTracker: SkillTracker,
): Promise<Record<string, unknown>> {
	const resolvedApi = resolveProviderApi(config.modelProvider ?? '');
	const maxToolCalls = step.maxToolCallsPerStep ?? DEFAULT_MAX_TOOL_CALLS_PER_STEP;

	// Filter tools to step-allowed subset (empty = all tools)
	const allTools = createAgentTools({
		proxyClient,
		workspaceRoot: WORKSPACE_ROOT,
		skillNames: (config.skills ?? []).map((s) => s.name),
		onSkillActivated: (skillName) => skillTracker.activatedSkills.add(skillName),
	});
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
			skillTracker.toolCallCount++;
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
			skillTracker.toolLog.push({
				name: event.toolName,
				ok: !(event.result as { isError?: boolean }).isError,
			});
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

	// Parse and validate JSON if a schema was expected. The output must both parse
	// as JSON AND conform to the declared schema — a bare JSON.parse would let
	// structurally-wrong output through despite the step claiming a strict schema.
	if (step.expectedResponseSchema && finalText.trim()) {
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(finalText.trim()) as Record<string, unknown>;
		} catch {
			logger.warn(
				{ stepId: step.id, stepName: step.name },
				'[workflow-runner] step output is not valid JSON despite expectedResponseSchema',
			);
			throw new Error(
				`Step "${step.name}" output is not valid JSON. Output was: ${finalText.slice(0, 200)}`,
			);
		}

		const schemaError = validateJsonSchema(step.expectedResponseSchema, parsed);
		if (schemaError) {
			logger.warn(
				{ stepId: step.id, stepName: step.name, schemaError },
				'[workflow-runner] step output does not conform to expectedResponseSchema',
			);
			throw new Error(
				`Step "${step.name}" output does not match the required schema: ${schemaError}`,
			);
		}
		return parsed;
	}

	return { text: finalText };
}

// ─── Node executors ─────────────────────────────────────────────────────────

/** Absolute safety cap on loop iterations, regardless of the node's maxIterations. */
const MAX_LOOP_ITERATIONS = 1000;

// ─── Smart (agent-judged) evaluation ──────────────────────────────────────────

/** System prompt for a one-shot, tool-less boolean decision by the agent. */
function buildSmartEvalPrompt(
	config: AgentRuntimeConfig,
	predicate: string,
	contextText: string,
): string {
	const { triggerContext } = config.workflow!;
	const now = new Date().toISOString();
	return (
		`## Workflow Decision\n` +
		`You are evaluating a yes/no condition inside an automated workflow.\n` +
		`Triggered by: ${triggerContext.triggerName} (${triggerContext.type})\n` +
		`Current server time: ${now}\n\n` +
		`## Agent Instructions\n${config.systemInstruction}\n\n` +
		`## Condition to evaluate\n${predicate}\n\n` +
		`## Available Context\n${contextText || '(no upstream data)'}\n\n` +
		`## Response Format\n` +
		`Decide whether the condition is TRUE or FALSE based only on the context above and your reasoning. ` +
		`Reply with ONLY a JSON object — no other text, no markdown fences:\n` +
		`{"result": true, "reason": "<one concise sentence>"}`
	);
}

/** Parse the agent's reply into a boolean (lenient); throws if no boolean is found. */
function parseBooleanResult(text: string): { result: boolean; reason: string } {
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (jsonMatch) {
		try {
			const parsed = JSON.parse(jsonMatch[0]) as { result?: unknown; reason?: unknown };
			const reason = typeof parsed.reason === 'string' ? parsed.reason : '';
			if (typeof parsed.result === 'boolean') return { result: parsed.result, reason };
			if (typeof parsed.result === 'string') {
				const v = parsed.result.trim().toLowerCase();
				if (v === 'true' || v === 'false') return { result: v === 'true', reason };
			}
		} catch {
			// fall through to regex
		}
	}
	const kv = text.match(/"result"\s*:\s*(true|false)/i);
	if (kv) return { result: kv[1].toLowerCase() === 'true', reason: '' };
	const bare = text.match(/\b(true|false)\b/i);
	if (bare) return { result: bare[1].toLowerCase() === 'true', reason: '' };
	throw new Error(`Smart evaluation did not return a boolean. Output was: ${text.slice(0, 200)}`);
}

/** Run a single tool-less LLM completion that decides the predicate true/false. */
async function evalSmartBoolean(
	ctx: RunContext,
	predicate: string,
	contextText: string,
): Promise<{ result: boolean; reason: string }> {
	const systemPrompt = buildSmartEvalPrompt(ctx.config, predicate, contextText);
	const messages = [
		{
			role: 'user' as const,
			content: [
				{
					type: 'text' as const,
					text: 'Evaluate the condition now and reply with the JSON object only.',
				},
			],
		},
	];
	const contentBlocks = await ctx.proxyClient.llmStream({ messages, systemPrompt, tools: [] });
	const text = contentBlocks
		.filter((b) => b.type === 'text')
		.map((b) => (b as TextContent).text)
		.join('\n')
		.trim();
	return parseBooleanResult(text);
}

/** Effective evaluation mode, inferring 'manual' for legacy filter-only nodes. */
function conditionMode(data: WorkflowConditionNode['data']): 'smart' | 'manual' {
	return data.evalMode ?? (data.prompt ? 'smart' : data.filter ? 'manual' : 'smart');
}

// ─── Node executors ─────────────────────────────────────────────────────────

/**
 * Evaluate a condition node ('smart' = agent judges a natural-language predicate;
 * 'manual' = deterministic filter) and route to its 'true' or 'false' output.
 */
async function runConditionNode(
	node: WorkflowConditionNode,
	ctx: RunContext,
): Promise<NodeExecResult> {
	const data = node.data;
	const mode = conditionMode(data);
	const stepIndex = ctx.nextOrder();
	const logId = await ctx.proxyClient.logWorkflowStepStart({
		runId: ctx.runId,
		stepId: node.id,
		stepIndex,
		stepName: data.name || 'Condition',
		inputContext: mode === 'smart' ? { mode, prompt: data.prompt } : { mode, filter: data.filter },
	});

	let result: boolean;
	let reason = '';
	try {
		if (mode === 'smart') {
			const predicate = applyTemplate(data.prompt ?? '', ctx);
			const evaluation = await evalSmartBoolean(ctx, predicate, buildPriorResultsText(ctx));
			result = evaluation.result;
			reason = evaluation.reason;
		} else {
			result = evalFilter(data.filter ?? { combinator: 'and', conditions: [] }, (t) =>
				resolveTemplate(t, ctx),
			);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await ctx.proxyClient.logWorkflowStepEnd({
			stepLogId: logId,
			status: 'failed',
			error: message,
		});
		return { status: 'stop', error: `Condition "${data.name}" failed: ${message}` };
	}

	ctx.outputsByNode[node.id] = reason ? { result, reason } : { result };
	await ctx.proxyClient.logWorkflowStepEnd({
		stepLogId: logId,
		status: 'success',
		outputData: ctx.outputsByNode[node.id],
	});
	logger.info(
		{ runId: ctx.runId, nodeId: node.id, mode, result },
		'[workflow-runner] condition evaluated',
	);
	return { status: 'ok', nextHandles: [result ? 'true' : 'false'] };
}

/**
 * Collect a loop's body: nodes reachable from the loop's 'loop' handle, in BFS
 * order, never crossing the back-edge (targetHandle 'loopBack') or the loop node.
 *
 * A NESTED loop's own body is NOT pulled in — when we reach a nested loop node we
 * include the node itself but do not follow its 'loop' handle (that subgraph belongs
 * to the nested loop and is executed by its own runLoopNode). This keeps each body
 * scope disjoint so a node is never executed by two different loops.
 */
function collectBodySubgraph(loopId: string, ctx: RunContext): string[] {
	const start = ctx
		.outgoing(loopId)
		.filter((e) => (e.sourceHandle ?? 'out') === 'loop')
		.map((e) => e.target);
	const ordered: string[] = [];
	const seen = new Set<string>([loopId]);
	const queue = [...start];
	while (queue.length > 0) {
		const id = queue.shift()!;
		if (seen.has(id)) continue;
		seen.add(id);
		ordered.push(id);
		const node = ctx.nodeById.get(id);
		for (const e of ctx.outgoing(id)) {
			if (e.targetHandle === 'loopBack' || e.target === loopId) continue;
			// Don't descend into a nested loop's own body subgraph.
			if (node?.type === 'loop' && (e.sourceHandle ?? 'out') === 'loop') continue;
			if (!seen.has(e.target)) queue.push(e.target);
		}
	}
	return ordered;
}

/** Best-effort parse of a resolved template into an array for forEach loops. */
function parseArray(raw: string): unknown[] {
	const trimmed = raw.trim();
	if (!trimmed) return [];
	try {
		const parsed = JSON.parse(trimmed) as unknown;
		if (Array.isArray(parsed)) return parsed;
		if (parsed && typeof parsed === 'object') return Object.values(parsed);
		return [parsed];
	} catch {
		// Fall back to newline-separated lines
		return trimmed
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean);
	}
}

/** Effective while-eval mode, inferring 'manual' for legacy condition-only loops. */
function loopWhileMode(data: WorkflowLoopNode['data']): 'smart' | 'manual' {
	return data.evalMode ?? (data.prompt ? 'smart' : data.condition ? 'manual' : 'smart');
}

/** Evaluate a while-loop's continue-condition (smart = agent judges; manual = filter). */
async function evalWhileCondition(node: WorkflowLoopNode, ctx: RunContext): Promise<boolean> {
	const data = node.data;
	if (loopWhileMode(data) === 'manual') {
		if (!data.condition) return false;
		return evalFilter(data.condition, (t) => resolveTemplate(t, ctx));
	}
	const predicate = applyTemplate(data.prompt ?? '', ctx);
	const parts = [
		buildPriorResultsText(ctx),
		`## Completed iterations: ${ctx.loopFrame ? ctx.loopFrame.index + 1 : 0}`,
	];
	const evaluation = await evalSmartBoolean(ctx, predicate, parts.join('\n\n'));
	return evaluation.result;
}

/**
 * Execute a loop node: run its body subgraph once per item (forEach) or while a
 * condition holds (while), exposing {{loop.item}} / {{loop.index}} to body nodes.
 * Continues via the 'done' handle when finished.
 */
async function runLoopNode(node: WorkflowLoopNode, ctx: RunContext): Promise<NodeExecResult> {
	const data = node.data;
	const bodyIds = collectBodySubgraph(node.id, ctx);
	const bodyScope = new Set(bodyIds);
	// Entry node(s) of the body: targets of the loop's 'loop' handle that live in the body.
	const bodyEntry = ctx
		.outgoing(node.id)
		.filter((e) => (e.sourceHandle ?? 'out') === 'loop' && e.targetHandle !== 'loopBack')
		.map((e) => e.target)
		.filter((t) => bodyScope.has(t));
	const maxIter = Math.max(1, Math.min(data.maxIterations ?? 50, MAX_LOOP_ITERATIONS));
	const items = data.mode === 'forEach' ? parseArray(resolveTemplate(data.items ?? '', ctx)) : [];

	const stepIndex = ctx.nextOrder();
	const loopLogId = await ctx.proxyClient.logWorkflowStepStart({
		runId: ctx.runId,
		stepId: node.id,
		stepIndex,
		stepName: data.name || 'Loop',
		inputContext: {
			mode: data.mode,
			...(data.mode === 'forEach' ? { itemCount: items.length } : {}),
			maxIterations: maxIter,
		},
	});

	const results: unknown[] = [];
	const prevLoopFrame = ctx.loopFrame;
	let iterations = 0;

	try {
		while (iterations < maxIter) {
			if (data.mode === 'forEach') {
				if (iterations >= items.length) break;
			} else {
				let keepGoing: boolean;
				try {
					keepGoing = await evalWhileCondition(node, ctx);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					await ctx.proxyClient.logWorkflowStepEnd({
						stepLogId: loopLogId,
						status: 'failed',
						error: message,
					});
					return { status: 'stop', error: `Loop "${data.name}" condition failed: ${message}` };
				}
				if (!keepGoing) break;
			}

			const item = data.mode === 'forEach' ? items[iterations] : undefined;
			ctx.loopFrame = { item, index: iterations };

			// Run the body as its own branch-aware subgraph each iteration (so conditions
			// and nested loops inside the body route correctly), scoped to the body nodes.
			const bodyResult = await runSubgraph(bodyEntry, bodyScope, ctx, { logSkips: false });
			if (bodyResult.status === 'stop') {
				await ctx.proxyClient.logWorkflowStepEnd({
					stepLogId: loopLogId,
					status: 'failed',
					error: bodyResult.error,
				});
				return { status: 'stop', error: bodyResult.error };
			}

			const lastBodyId = bodyIds[bodyIds.length - 1];
			if (lastBodyId && ctx.outputsByNode[lastBodyId]) {
				results.push(ctx.outputsByNode[lastBodyId]);
			}
			iterations++;
		}
	} finally {
		ctx.loopFrame = prevLoopFrame;
	}

	ctx.outputsByNode[node.id] = { iterations, results };
	await ctx.proxyClient.logWorkflowStepEnd({
		stepLogId: loopLogId,
		status: 'success',
		outputData: { iterations, results },
	});
	logger.info(
		{ runId: ctx.runId, nodeId: node.id, iterations },
		'[workflow-runner] loop completed',
	);
	return { status: 'ok', nextHandles: ['done'] };
}

/**
 * Execute one agent (step) node as a full pi-agent turn (prompt → tool loop →
 * final reply), with the step's retry/continue/stop error handling. Returns
 * 'stop' to halt the whole run, or 'ok' with the handle(s) to follow ('out').
 */
async function runAgentNode(node: WorkflowAgentNode, ctx: RunContext): Promise<NodeExecResult> {
	const step = node.data;
	const inputContext = resolveInputMapping(step, ctx);

	const stepIndex = ctx.nextOrder();
	logger.info(
		{ runId: ctx.runId, stepId: step.id, stepName: step.name, stepIndex },
		'[workflow-runner] executing step',
	);

	// Log step start — returns a stepLogId for subsequent completion calls
	const stepLogId = await ctx.proxyClient.logWorkflowStepStart({
		runId: ctx.runId,
		stepId: step.id,
		stepIndex,
		stepName: step.name,
		inputContext: { instruction: step.instruction, inputMapping: step.inputMapping ?? null },
	});

	const stepPrompt = buildStepSystemPrompt(ctx.config, step, inputContext);

	const maxRetries =
		step.errorHandling.action === 'retry' ? (step.errorHandling.maxRetries ?? 1) : 0;
	let lastError: Error | null = null;
	let succeeded = false;
	let stepOutput: Record<string, unknown> = {};
	// Track the current log ID (may change between retry attempts)
	let currentLogId = stepLogId;

	for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
		try {
			stepOutput = await executeStep(
				step,
				ctx.config,
				ctx.proxyClient,
				stepPrompt,
				ctx.skillTracker,
			);
			succeeded = true;
			lastError = null;
			break;
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			logger.warn(
				{ runId: ctx.runId, stepId: step.id, stepName: step.name, attempt, err: lastError.message },
				'[workflow-runner] step attempt failed',
			);

			if (attempt <= maxRetries) {
				// Close the current attempt log as failed
				await ctx.proxyClient.logWorkflowStepEnd({
					stepLogId: currentLogId,
					status: 'failed',
					error: `Attempt ${attempt} failed: ${lastError.message}. Retrying...`,
				});
				// Open a new log row for the retry attempt
				currentLogId = await ctx.proxyClient.logWorkflowStepStart({
					runId: ctx.runId,
					stepId: step.id,
					stepIndex,
					stepName: step.name,
					inputContext: { instruction: step.instruction, inputMapping: step.inputMapping ?? null },
					attemptNumber: attempt + 1,
				});
			}
		}
	}

	if (succeeded) {
		ctx.outputsByNode[node.id] = stepOutput;
		await ctx.proxyClient.logWorkflowStepEnd({
			stepLogId: currentLogId,
			status: 'success',
			outputData: stepOutput,
		});
		logger.info(
			{ runId: ctx.runId, stepId: step.id, stepName: step.name },
			'[workflow-runner] step completed',
		);
		return { status: 'ok', nextHandles: ['out'] };
	}

	const errorMessage = lastError?.message ?? 'Unknown error';
	if (
		step.errorHandling.action === 'continue' ||
		step.errorHandling.fallbackAction === 'continue'
	) {
		// Mark failed but continue along the graph
		await ctx.proxyClient.logWorkflowStepEnd({
			stepLogId: currentLogId,
			status: 'failed',
			error: errorMessage,
		});
		logger.warn(
			{ runId: ctx.runId, stepId: step.id, stepName: step.name },
			'[workflow-runner] step failed — continuing (errorHandling.action=continue)',
		);
		ctx.outputsByNode[node.id] = { error: errorMessage };
		return { status: 'ok', nextHandles: ['out'] };
	}

	// Stop the whole run
	await ctx.proxyClient.logWorkflowStepEnd({
		stepLogId: currentLogId,
		status: 'failed',
		error: errorMessage,
	});
	return { status: 'stop', error: `Step "${step.name}" failed: ${errorMessage}` };
}

/** Dispatch a node to its executor by type. */
async function executeNode(node: WorkflowNode, ctx: RunContext): Promise<NodeExecResult> {
	switch (node.type) {
		case 'trigger':
			return { status: 'ok', nextHandles: ['out'] };
		case 'agent':
			return runAgentNode(node, ctx);
		case 'condition':
			return runConditionNode(node, ctx);
		case 'loop':
			return runLoopNode(node, ctx);
	}
}

/** Log a single non-trigger node as 'skipped' (idempotent via ctx.skipped). */
async function logSkippedNode(node: WorkflowNode, ctx: RunContext): Promise<void> {
	if (node.type === 'trigger' || ctx.skipped.has(node.id) || ctx.visited.has(node.id)) return;
	ctx.skipped.add(node.id);
	const stepIndex = ctx.nextOrder();
	const skippedLogId = await ctx.proxyClient.logWorkflowStepStart({
		runId: ctx.runId,
		stepId: node.id,
		stepIndex,
		stepName: node.data.name || node.type,
		inputContext: {},
	});
	await ctx.proxyClient.logWorkflowStepEnd({ stepLogId: skippedLogId, status: 'skipped' });
}

/**
 * Branch-aware graph traversal over a set of in-scope nodes.
 *
 * Each forward (non-loopBack) edge is "decided" active or dead once its source is
 * settled: active iff the source executed AND the edge's source handle was among the
 * handles the node returned (e.g. a condition activates only its 'true' OR 'false'
 * edge). A node settles once every in-scope predecessor edge is decided; it then
 * EXECUTES if it is an entry root or has at least one active incoming edge, otherwise
 * it is SKIPPED (and its outgoing edges decided dead, propagating the skip).
 *
 * This makes diamonds correct: a merge node fed by both branches of a condition
 * runs exactly once (one branch active, the other skipped) instead of deadlocking on
 * the never-taken branch. Used for the main graph and, per iteration, for loop bodies.
 */
async function runSubgraph(
	entryIds: string[],
	scope: Set<string>,
	ctx: RunContext,
	opts: { logSkips: boolean },
): Promise<{ status: 'ok' } | { status: 'stop'; error: string }> {
	const localSettled = new Set<string>();
	const edgeActive = new Map<string, boolean>();
	const entrySet = new Set(entryIds);

	/** In-scope, non-loopBack incoming edges (out-of-scope predecessors don't gate). */
	const incomingInScope = (id: string) =>
		ctx.incoming(id).filter((e) => e.targetHandle !== 'loopBack' && scope.has(e.source));
	const decidable = (id: string) => incomingInScope(id).every((e) => edgeActive.has(e.id));
	const isLive = (id: string) =>
		entrySet.has(id) || incomingInScope(id).some((e) => edgeActive.get(e.id) === true);

	const queue: string[] = [...entryIds];
	while (queue.length > 0) {
		const id = queue.shift()!;
		if (!scope.has(id) || localSettled.has(id)) continue;
		if (!decidable(id)) continue; // re-enqueued when its last predecessor edge is decided
		const node = ctx.nodeById.get(id);
		if (!node) {
			localSettled.add(id);
			continue;
		}
		localSettled.add(id);

		if (isLive(id)) {
			ctx.visited.add(id);
			const result = await executeNode(node, ctx);
			if (result.status === 'stop') return { status: 'stop', error: result.error };
			for (const e of ctx.outgoing(id)) {
				if (e.targetHandle === 'loopBack' || !scope.has(e.target)) continue;
				edgeActive.set(e.id, result.nextHandles.includes(e.sourceHandle ?? 'out'));
			}
		} else {
			if (opts.logSkips) await logSkippedNode(node, ctx);
			for (const e of ctx.outgoing(id)) {
				if (e.targetHandle === 'loopBack' || !scope.has(e.target)) continue;
				edgeActive.set(e.id, false);
			}
		}

		for (const e of ctx.outgoing(id)) {
			if (e.targetHandle === 'loopBack' || !scope.has(e.target)) continue;
			queue.push(e.target);
		}
	}
	return { status: 'ok' };
}

/** Log any node that neither executed nor was already skipped (e.g. disconnected). */
async function sweepSkipped(ctx: RunContext): Promise<void> {
	for (const node of ctx.nodeById.values()) {
		await logSkippedNode(node, ctx);
	}
}

// ─── Main workflow runner ─────────────────────────────────────────────────────

/**
 * Executes a full workflow pipeline for a non-chat trigger by traversing the
 * node/edge graph from the trigger node.
 *
 * Traversal is breadth-first from the trigger, following each executed node's
 * returned handles. A node runs only once all of its (non-loop-back) predecessors
 * have run, so a node fed by multiple branches sees their outputs. Each agent node
 * runs a full pi-agent loop with its own retry/continue/stop error handling.
 *
 * Backward compatibility: the graph is synthesized from the legacy `steps` array
 * when absent (ensureGraph), and inputMapping resolves both
 * {{steps.<nodeId>.output}} and the legacy {{steps.<index>.output}} alias.
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

	// Build the execution graph (synthesizing from legacy steps when absent).
	const { nodes, edges } = ensureGraph(definition);
	const nodeById = new Map<string, WorkflowNode>(nodes.map((n) => [n.id, n]));
	const outgoing = (id: string): WorkflowEdge[] => edges.filter((e) => e.source === id);
	const incoming = (id: string): WorkflowEdge[] => edges.filter((e) => e.target === id);
	const triggerNode = nodes.find((n) => n.type === 'trigger');

	// Agent node ids in linear order — backs the legacy {{steps.<index>.output}} alias.
	const orderedAgentIds = graphToSteps(nodes, edges).map((s) => s.id);

	// outputsByNode[nodeId] = parsed output of that node (for inputMapping downstream)
	const outputsByNode: Record<string, Record<string, unknown>> = {};

	// Skill activation is tracked across ALL nodes; one trace per activated
	// skill is recorded when the run ends (success or failure).
	const skillTracker: SkillTracker = {
		activatedSkills: new Set<string>(),
		toolLog: [],
		toolCallCount: 0,
	};

	let order = 0;
	const ctx: RunContext = {
		config,
		proxyClient,
		runId,
		triggerPayloadJson,
		triggerPayload: triggerContext.payload,
		nodeById,
		outgoing,
		incoming,
		outputsByNode,
		orderedAgentIds,
		skillTracker,
		triggerNodeId: triggerNode?.id ?? 'trigger',
		loopFrame: null,
		visited: new Set<string>(),
		skipped: new Set<string>(),
		nextOrder: () => order++,
	};

	logger.info(
		{ runId, workflowId: definition.id, stepCount: orderedAgentIds.length },
		'[workflow-runner] starting workflow',
	);

	if (!triggerNode) {
		await proxyClient.completeWorkflowRun({
			runId,
			status: 'error',
			error: 'Workflow has no trigger node',
		});
		return;
	}

	// Loop bodies are executed by their own loop node (per iteration), so exclude
	// them from the main scope — otherwise the main traversal would run them too.
	const bodyNodeIds = new Set<string>();
	for (const n of nodes) {
		if (n.type === 'loop') for (const id of collectBodySubgraph(n.id, ctx)) bodyNodeIds.add(id);
	}
	const mainScope = new Set(nodes.map((n) => n.id).filter((id) => !bodyNodeIds.has(id)));

	const result = await runSubgraph([triggerNode.id], mainScope, ctx, { logSkips: true });

	if (result.status === 'stop') {
		await sweepSkipped(ctx);
		await proxyClient.completeWorkflowRun({ runId, status: 'error', error: result.error });
		await recordSkillTraces(
			proxyClient,
			skillTracker.activatedSkills,
			false,
			skillTracker.toolCallCount,
			skillTracker.toolLog,
		);
		logger.error(
			{ runId, errorMessage: result.error },
			'[workflow-runner] workflow stopped due to step failure',
		);
		return;
	}

	// All reachable nodes complete; log any unreached node honestly as skipped.
	await sweepSkipped(ctx);
	await proxyClient.completeWorkflowRun({ runId, status: 'completed' });
	await recordSkillTraces(
		proxyClient,
		skillTracker.activatedSkills,
		true,
		skillTracker.toolCallCount,
		skillTracker.toolLog,
	);
	logger.info({ runId, workflowId: definition.id }, '[workflow-runner] workflow completed');
}

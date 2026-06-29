/**
 * Browser-safe catalog of the agent tools that a workflow step can grant via its
 * `allowedTools` list. Shared by the web builder (renders the picker) and the
 * agent-runtime (documents the set in `create_workflow`). Pure data — no node deps.
 *
 * Lives in `@repo/utils` (compiled to dist JS) rather than `@repo/types` because
 * these are runtime VALUES: the agent-runtime imports them and runs under Node's
 * type stripping, which cannot resolve `@repo/types`' un-compiled `.ts` source at
 * runtime. The web app must import these only server-side (`+page.server.ts`) —
 * `@repo/utils` is Node-only (uses `node:fs`) and breaks the browser bundle.
 *
 * Deliberately curated: niche tools (`chess_engine`) and self-referential ones
 * (`create_workflow`) are omitted from the picker. The 11 `browser_*` tools are
 * NOT listed individually — they are granted as a group via `BROWSER_TOOL_GROUP`.
 */
import type { WorkflowToolOption, WorkflowToolCategory } from '@repo/types';

/**
 * Pseudo tool token. When present in a step's `allowedTools`, every registered
 * `browser_*` tool is granted. Expanded at the runtime filter (workflow-runner)
 * by name prefix, so the individual browser tool names never need enumerating.
 */
export const BROWSER_TOOL_GROUP = 'agent-browser';

/**
 * The individually selectable tools, grouped by category. The `agent-browser`
 * group (and its `browser_*` tools) is rendered separately and gated on browser
 * availability — it is intentionally not in this list.
 */
export const WORKFLOW_TOOL_CATALOG: readonly WorkflowToolOption[] = [
	{ name: 'call_api', label: 'Call API', category: 'Core' },
	{ name: 'run_terminal', label: 'Run Terminal', category: 'Core' },
	{ name: 'run_code', label: 'Run Code', category: 'Core' },
	{ name: 'ask_human', label: 'Ask Human', category: 'Core' },
	{ name: 'read_file', label: 'Read File', category: 'Files' },
	{ name: 'write_file', label: 'Write File', category: 'Files' },
	{ name: 'list_files', label: 'List Files', category: 'Files' },
	{ name: 'share_file', label: 'Share File', category: 'Files' },
	{ name: 'memory_write', label: 'Memory Write', category: 'Memory' },
	{ name: 'memory_search', label: 'Memory Search', category: 'Memory' },
	{ name: 'memory_delete', label: 'Memory Delete', category: 'Memory' },
	{ name: 'list_workflows', label: 'List Workflows', category: 'Workflows' },
	{ name: 'read_workflow', label: 'Read Workflow', category: 'Workflows' },
	{ name: 'trigger_workflow', label: 'Trigger Workflow', category: 'Workflows' },
] as const;

/** Categories in render order (used by the picker to build sections). */
export const WORKFLOW_TOOL_CATEGORIES: readonly WorkflowToolCategory[] = [
	'Core',
	'Files',
	'Memory',
	'Workflows',
] as const;

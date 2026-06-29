/**
 * Types for the workflow-step tool picker.
 *
 * IMPORTANT: `@repo/types` is a TYPES-ONLY package — it is consumed as un-compiled
 * TypeScript source (its `exports` points at `./src/index.ts`, there is no build).
 * Never add a runtime VALUE (const/array/function) here: the agent-runtime imports
 * this package and runs under Node's type stripping, which cannot resolve the
 * barrel's `.js` specifiers at runtime and crashes with ERR_MODULE_NOT_FOUND.
 * The matching runtime values (BROWSER_TOOL_GROUP, WORKFLOW_TOOL_CATALOG,
 * WORKFLOW_TOOL_CATEGORIES) live in the compiled `@repo/utils`
 * (packages/utils/src/workflow/tool-catalog.ts).
 */

/** Display categories for the workflow step tool picker, in render order. */
export type WorkflowToolCategory = 'Core' | 'Files' | 'Memory' | 'Workflows';

export interface WorkflowToolOption {
	/** The exact tool `name` matched against the registered tools at runtime. */
	name: string;
	/** Human-readable label for the picker. */
	label: string;
	/** Section the option is grouped under in the picker. */
	category: WorkflowToolCategory;
}

/**
 * The tool-picker catalog as passed from a server `load` to the workflow builder
 * components. The concrete values live in `@repo/utils` (Node-only) and are threaded
 * through props so browser code never imports that package directly.
 */
export interface WorkflowToolCatalog {
	catalog: readonly WorkflowToolOption[];
	categories: readonly WorkflowToolCategory[];
	browserToolGroup: string;
}

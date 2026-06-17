import type { ApiResponse } from './api.js';
import type { AgentThreadStatus } from './agentRuntime.js';
import type { WorkflowRunStatus } from './workflow.js';

/**
 * A single entry in the dashboard "recent activity" feed — either an interactive
 * chat thread or a workflow run. The server merges both sources across all of the
 * owner's agents and sorts by `timestamp` (newest first).
 */
export type ActivityItem = ChatActivityItem | WorkflowRunActivityItem;

/** A recent interactive chat thread (workflow-generated threads are excluded). */
export interface ChatActivityItem {
	kind: 'chat';
	/** Thread id — used to deep-link into the conversation. */
	id: string;
	agentId: string;
	agentName: string;
	title?: string;
	status: AgentThreadStatus;
	/** Thread `updatedAt` — the recency key. */
	timestamp: Date;
}

/** A recent workflow run. */
export interface WorkflowRunActivityItem {
	kind: 'workflow_run';
	/** Run id — used to deep-link into the run detail. */
	id: string;
	workflowId: string;
	workflowName: string;
	agentId: string;
	agentName: string;
	status: WorkflowRunStatus;
	error?: string;
	/** Run `startedAt` — the recency key. */
	timestamp: Date;
}

/** GET /v1/dashboard/activity?limit=N */
export type DashboardActivityResponse = ApiResponse<ActivityItem[]>;

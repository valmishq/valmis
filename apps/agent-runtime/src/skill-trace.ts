import { logger } from '@repo/utils';
import type { ProxyClient } from './proxy-client.js';

/** Condensed per-tool outcome captured during a turn (sent in executionLog) */
export interface ToolLogEntry {
	name: string;
	ok: boolean;
}

/** executionLog is capped server-side at 16 KB — keep the tool log short */
const MAX_TOOL_LOG_ENTRIES = 50;

/**
 * Records one execution trace per activated skill for the evolution engine.
 * A skill counts as "activated" when the agent read any file under its
 * skills/<name>/ folder during the turn (tracked via ToolContext.onSkillActivated).
 *
 * Failures are logged and swallowed — trace recording must never fail a turn.
 * Awaited (not fire-and-forget) because the runtime process exits right after
 * the runner returns.
 */
export async function recordSkillTraces(
	proxyClient: ProxyClient,
	activatedSkills: ReadonlySet<string>,
	success: boolean,
	toolCallCount: number,
	toolLog: ToolLogEntry[],
): Promise<void> {
	if (activatedSkills.size === 0) return;

	const executionLog = { toolCalls: toolLog.slice(0, MAX_TOOL_LOG_ENTRIES) };

	for (const skillName of activatedSkills) {
		try {
			await proxyClient.recordSkillTrace({
				skillName,
				success,
				toolCallCount,
				executionLog,
			});
		} catch (err) {
			logger.warn({ err, skillName }, '[skill-trace] failed to record skill trace');
		}
	}
}

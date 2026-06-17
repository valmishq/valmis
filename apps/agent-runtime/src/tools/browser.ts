import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent, ImageContent } from '@earendil-works/pi-ai';
import type { BrowserCommand } from '@repo/types';
import { logger } from '@repo/utils';
import type { ToolContext } from './types.js';

/**
 * Browser tools — drive a real headless browser that the HOST manages (a
 * separate container in production, or a local Playwright instance in dev). The
 * agent runtime never runs a browser itself; each tool sends one BrowserCommand
 * to the backend via the proxy, which executes it and returns the result.
 *
 * These tools are registered ONLY when ctx.browserAvailable is true (the agent
 * has internet access and the project-wide browser feature is enabled). The
 * backend additionally enforces the same gate on every call with a live DB
 * check, so a revoked agent is refused even if a tool slips through.
 *
 * Workflow: call browser_navigate (or browser_snapshot) to get a list of
 * interactive elements, each tagged with a stable ref (e1, e2, …). Then act on
 * those refs with browser_click / browser_type / browser_select. Refs come only
 * from the most recent snapshot — re-snapshot after the page changes.
 */

/** Send one command to the host browser and normalise the result into tool content. */
async function runBrowserCommand(
	ctx: ToolContext,
	command: BrowserCommand,
): Promise<{ content: (TextContent | ImageContent)[]; details: Record<string, never> }> {
	try {
		const result = await ctx.proxyClient.browserAction({ command });
		const content: (TextContent | ImageContent)[] = [];
		if (result.text) {
			const text = result.url ? `${result.text}\n\n(current url: ${result.url})` : result.text;
			content.push({ type: 'text', text });
		}
		if (result.image) {
			content.push({
				type: 'image',
				data: result.image.data,
				mimeType: result.image.mimeType,
			});
		}
		if (content.length === 0) {
			content.push({ type: 'text', text: 'Done.' });
		}
		return { content, details: {} };
	} catch (err) {
		// Errors are returned as text (never thrown) so the agent loop can react.
		const message = err instanceof Error ? err.message : String(err);
		logger.warn({ err, action: command.action }, '[agent-runner] browser command failed');
		const textContent: TextContent = {
			type: 'text',
			text: `Browser ${command.action} failed: ${message}`,
		};
		return { content: [textContent], details: {} };
	}
}

function navigateTool(ctx: ToolContext): AgentTool {
	return {
		name: 'browser_navigate',
		label: 'Browser: Navigate',
		description:
			'Open a URL in the managed headless browser. Returns the page title and a ' +
			'snapshot of interactive elements (each with a stable ref like "e3") that you ' +
			'pass to browser_click / browser_type. Use this before interacting with a page.',
		parameters: Type.Object({
			url: Type.String({ description: 'Absolute URL to open, e.g. https://example.com' }),
		}),
		execute: async (_toolCallId, params) => {
			const { url } = params as { url: string };
			return runBrowserCommand(ctx, { action: 'navigate', url });
		},
	};
}

function snapshotTool(ctx: ToolContext): AgentTool {
	return {
		name: 'browser_snapshot',
		label: 'Browser: Snapshot',
		description:
			'Return a fresh snapshot of the current page: its title and the list of ' +
			'interactive elements, each with a stable ref (e1, e2, …). Call this whenever ' +
			'the page may have changed so your refs are up to date before clicking or typing.',
		parameters: Type.Object({}),
		execute: async () => runBrowserCommand(ctx, { action: 'snapshot' }),
	};
}

function clickTool(ctx: ToolContext): AgentTool {
	return {
		name: 'browser_click',
		label: 'Browser: Click',
		description:
			'Click the element with the given ref (from the most recent snapshot). ' +
			'Returns a fresh snapshot of the resulting page.',
		parameters: Type.Object({
			ref: Type.String({ description: 'Element ref from a snapshot, e.g. "e5"' }),
		}),
		execute: async (_toolCallId, params) => {
			const { ref } = params as { ref: string };
			return runBrowserCommand(ctx, { action: 'click', ref });
		},
	};
}

function typeTool(ctx: ToolContext): AgentTool {
	return {
		name: 'browser_type',
		label: 'Browser: Type',
		description:
			'Type text into the input/textarea element with the given ref (from a snapshot). ' +
			'Set submit=true to press Enter afterwards (e.g. to submit a search box or form).',
		parameters: Type.Object({
			ref: Type.String({ description: 'Element ref from a snapshot, e.g. "e2"' }),
			text: Type.String({ description: 'Text to type into the field' }),
			submit: Type.Optional(
				Type.Boolean({ description: 'Press Enter after typing (submit the field). Default false.' }),
			),
		}),
		execute: async (_toolCallId, params) => {
			const { ref, text, submit } = params as { ref: string; text: string; submit?: boolean };
			return runBrowserCommand(ctx, { action: 'type', ref, text, submit });
		},
	};
}

function selectTool(ctx: ToolContext): AgentTool {
	return {
		name: 'browser_select',
		label: 'Browser: Select Option',
		description:
			'Select one or more options in a <select> dropdown element with the given ref. ' +
			'Values match the option values or labels.',
		parameters: Type.Object({
			ref: Type.String({ description: 'Element ref of the <select>, e.g. "e7"' }),
			values: Type.Array(Type.String(), { description: 'Option value(s) or label(s) to select' }),
		}),
		execute: async (_toolCallId, params) => {
			const { ref, values } = params as { ref: string; values: string[] };
			return runBrowserCommand(ctx, { action: 'select', ref, values });
		},
	};
}

function pressKeyTool(ctx: ToolContext): AgentTool {
	return {
		name: 'browser_press_key',
		label: 'Browser: Press Key',
		description:
			'Press a single keyboard key on the page (e.g. "Enter", "Tab", "Escape", ' +
			'"ArrowDown", "PageDown"). Useful for navigating menus or dismissing dialogs.',
		parameters: Type.Object({
			key: Type.String({ description: 'Key name, e.g. "Enter", "Tab", "Escape"' }),
		}),
		execute: async (_toolCallId, params) => {
			const { key } = params as { key: string };
			return runBrowserCommand(ctx, { action: 'pressKey', key });
		},
	};
}

function screenshotTool(ctx: ToolContext): AgentTool {
	return {
		name: 'browser_screenshot',
		label: 'Browser: Screenshot',
		description:
			'Capture a PNG screenshot of the current page (returned as an image you can see). ' +
			'Use it to visually inspect a page when the text snapshot is not enough. Set ' +
			'fullPage=true to capture the entire scrollable page rather than the viewport. ' +
			'Pass a `path` (e.g. "shots/page.png") to also SAVE the screenshot into your ' +
			'workspace, where read_file/list_files can then access it.',
		parameters: Type.Object({
			fullPage: Type.Optional(
				Type.Boolean({ description: 'Capture the full scrollable page. Default false (viewport only).' }),
			),
			path: Type.Optional(
				Type.String({
					description:
						'Optional workspace-relative path to save the PNG (e.g. "shots/contact.png"). ' +
						'Parent folders are created automatically.',
				}),
			),
		}),
		execute: async (_toolCallId, params) => {
			const { fullPage, path } = params as { fullPage?: boolean; path?: string };
			return runBrowserCommand(ctx, { action: 'screenshot', fullPage, path });
		},
	};
}

function readPageTool(ctx: ToolContext): AgentTool {
	return {
		name: 'browser_read_page',
		label: 'Browser: Read Page',
		description:
			'Return the readable text content of the current page (cheaper than a full ' +
			'snapshot when you just need to read an article or result text).',
		parameters: Type.Object({}),
		execute: async () => runBrowserCommand(ctx, { action: 'readPage' }),
	};
}

function waitForTool(ctx: ToolContext): AgentTool {
	return {
		name: 'browser_wait_for',
		label: 'Browser: Wait',
		description:
			'Wait for the page to reach a state before continuing: provide `text` to wait ' +
			'until that text appears, or `state` ("load" or "networkidle") to wait for the ' +
			'page to settle. Use after an action that triggers async loading.',
		parameters: Type.Object({
			text: Type.Optional(Type.String({ description: 'Wait until this text appears on the page' })),
			state: Type.Optional(
				Type.Union([Type.Literal('load'), Type.Literal('networkidle')], {
					description: 'Wait for this load state instead of text',
				}),
			),
			timeoutMs: Type.Optional(
				Type.Number({ description: 'Max wait in milliseconds (default 15000)' }),
			),
		}),
		execute: async (_toolCallId, params) => {
			const { text, state, timeoutMs } = params as {
				text?: string;
				state?: 'load' | 'networkidle';
				timeoutMs?: number;
			};
			return runBrowserCommand(ctx, { action: 'waitFor', text, state, timeoutMs });
		},
	};
}

function goBackTool(ctx: ToolContext): AgentTool {
	return {
		name: 'browser_go_back',
		label: 'Browser: Back',
		description: 'Go back to the previous page in history. Returns a snapshot of that page.',
		parameters: Type.Object({}),
		execute: async () => runBrowserCommand(ctx, { action: 'goBack' }),
	};
}

function goForwardTool(ctx: ToolContext): AgentTool {
	return {
		name: 'browser_go_forward',
		label: 'Browser: Forward',
		description: 'Go forward to the next page in history. Returns a snapshot of that page.',
		parameters: Type.Object({}),
		execute: async () => runBrowserCommand(ctx, { action: 'goForward' }),
	};
}

/** Build the full set of browser tools. Only call when ctx.browserAvailable is true. */
export function createBrowserTools(ctx: ToolContext): AgentTool[] {
	return [
		navigateTool(ctx),
		snapshotTool(ctx),
		clickTool(ctx),
		typeTool(ctx),
		selectTool(ctx),
		pressKeyTool(ctx),
		screenshotTool(ctx),
		readPageTool(ctx),
		waitForTool(ctx),
		goBackTool(ctx),
		goForwardTool(ctx),
	];
}

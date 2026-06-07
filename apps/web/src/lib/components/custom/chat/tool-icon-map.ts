import WrenchIcon from '@lucide/svelte/icons/wrench';
import DatabaseIcon from '@lucide/svelte/icons/database';
import SearchIcon from '@lucide/svelte/icons/search';
import FileTextIcon from '@lucide/svelte/icons/file-text';
import FilePenIcon from '@lucide/svelte/icons/file-pen';
import FolderIcon from '@lucide/svelte/icons/folder';
import TerminalIcon from '@lucide/svelte/icons/terminal';
import CodeIcon from '@lucide/svelte/icons/code-2';
import MessageCircleIcon from '@lucide/svelte/icons/message-circle';

/**
 * Maps built-in agent tool names to their Lucide icon constructors.
 * Used by ToolCallIndicator to render a meaningful icon for each tool type.
 * Fall back to DEFAULT_TOOL_ICON for any tool name not listed here.
 */
export const TOOL_ICON_MAP: Record<string, typeof WrenchIcon> = {
	call_api: WrenchIcon,
	memory_write: DatabaseIcon,
	memory_search: SearchIcon,
	read_file: FileTextIcon,
	write_file: FilePenIcon,
	list_files: FolderIcon,
	run_terminal: TerminalIcon,
	run_code: CodeIcon,
	ask_human: MessageCircleIcon
};

/** Fallback icon when a tool name is not found in TOOL_ICON_MAP */
export { WrenchIcon as DEFAULT_TOOL_ICON };

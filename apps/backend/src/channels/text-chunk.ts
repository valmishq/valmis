/**
 * Split a string into chunks no longer than `maxLen`, preferring to break on a
 * newline so messages aren't cut mid-line. Falls back to a hard cut at `maxLen`
 * only when there is no suitable newline in the second half of the window.
 *
 * Shared by all batched channel adapters (Telegram, Discord, …) which each have
 * their own platform message-length ceiling.
 */
export function chunkText(text: string, maxLen: number): string[] {
	if (text.length <= maxLen) return [text];

	const chunks: string[] = [];
	let remaining = text;

	while (remaining.length > maxLen) {
		const slice = remaining.slice(0, maxLen);
		const lastNl = slice.lastIndexOf('\n');
		const splitAt = lastNl > maxLen / 2 ? lastNl : maxLen;
		chunks.push(remaining.slice(0, splitAt));
		remaining = remaining.slice(splitAt).trimStart();
	}

	if (remaining) chunks.push(remaining);
	return chunks;
}

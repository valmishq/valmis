/** Absolute short date, e.g. "Jun 17, 2026". */
export function formatDate(value: string | Date): string {
	return new Date(value).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

/**
 * Compact relative time for activity feeds: "just now", "5m ago", "2h ago",
 * "3d ago", and an absolute date once older than a week.
 */
export function formatRelativeTime(value: string | Date): string {
	const then = new Date(value).getTime();
	if (Number.isNaN(then)) return '';
	const seconds = Math.round((Date.now() - then) / 1000);
	if (seconds < 45) return 'just now';
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 7) return `${days}d ago`;
	return formatDate(value);
}

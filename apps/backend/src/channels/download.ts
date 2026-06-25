import { logger } from '../config/logger.js';

/**
 * Strip secrets from a URL before logging. Telegram's file-download URL embeds the
 * bot token in its path (`/file/bot<TOKEN>/<path>`), so the raw URL must never be
 * logged. Replaces any `/bot<token>/` segment with `/bot<redacted>/`.
 */
function redactUrl(url: string): string {
	return url.replace(/\/bot[^/]+\//, '/bot<redacted>/');
}

/**
 * Fetch a URL into a Buffer with a HARD byte cap enforced while streaming.
 *
 * Channel inbound attachments (Telegram/Discord) are downloaded server-side. A
 * remote (or a lying/absent Content-Length) must never be able to force an
 * unbounded allocation in the shared backend process, so we:
 *   1. reject early when the declared Content-Length already exceeds the cap, and
 *   2. read the body incrementally and abort the moment the running total passes
 *      the cap — we never buffer more than `maxBytes` (+ one chunk).
 *
 * Throws on a non-2xx response, a transport error, or an over-cap body. The
 * caller is expected to treat a throw as a per-file failure, never fatal.
 */
export async function fetchCapped(
	url: string,
	maxBytes: number,
	init?: RequestInit,
): Promise<Buffer> {
	const res = await fetch(url, init);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);

	const declared = Number(res.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > maxBytes) {
		throw new Error(`exceeds the ${Math.floor(maxBytes / (1024 * 1024))}MB limit`);
	}

	const reader = res.body?.getReader();
	if (!reader) {
		// No stream available (shouldn't happen on Node ≥18) — fall back, still capped.
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length > maxBytes) {
			throw new Error(`exceeds the ${Math.floor(maxBytes / (1024 * 1024))}MB limit`);
		}
		return buf;
	}

	const chunks: Buffer[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.length;
			if (total > maxBytes) {
				await reader.cancel().catch(() => {});
				throw new Error(`exceeds the ${Math.floor(maxBytes / (1024 * 1024))}MB limit`);
			}
			chunks.push(Buffer.from(value));
		}
	} catch (err) {
		// Surface cap/transport errors; ensure the stream is released.
		await reader.cancel().catch(() => {});
		logger.debug({ err, url: redactUrl(url) }, '[channel] capped download aborted');
		throw err;
	}

	return Buffer.concat(chunks, total);
}

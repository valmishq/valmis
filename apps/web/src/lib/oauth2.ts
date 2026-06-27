import { api } from '$lib/api.client.js';

export interface OAuth2ConnectResult {
	ok: boolean;
	message?: string;
	/** True when no browser step was needed (clientCredentials grant — tokens exchanged server-side) */
	immediate?: boolean;
}

/**
 * Run the OAuth2 authorization flow in a popup window and resolve once it completes.
 *
 * The popup is opened SYNCHRONOUSLY (before the async authorize request) so the
 * call must originate from a user gesture (a click handler) — otherwise the
 * browser's popup blocker will reject it.
 *
 * The popup lands on `oauth2/callback`, which posts a `{ source: 'valmis-oauth2',
 * status, message }` message back to this window (the opener) and closes itself.
 * Used by both the credentials list and the in-dialog connect panel.
 */
export function connectOAuth2(credentialId: string): Promise<OAuth2ConnectResult> {
	// Open the popup synchronously to preserve the user gesture (avoid popup blockers).
	const popup = window.open('', 'valmis-oauth2', 'width=600,height=720');
	if (!popup) {
		return Promise.resolve({
			ok: false,
			message: 'Popup blocked. Allow popups for this site, then try connecting again.'
		});
	}

	return new Promise<OAuth2ConnectResult>((resolve) => {
		let settled = false;
		let pollTimer: ReturnType<typeof setInterval> | undefined;

		function finish(result: OAuth2ConnectResult) {
			if (settled) return;
			settled = true;
			window.removeEventListener('message', onMessage);
			if (pollTimer) clearInterval(pollTimer);
			resolve(result);
		}

		function onMessage(event: MessageEvent) {
			if (event.origin !== window.location.origin) return;
			if (event.data?.source !== 'valmis-oauth2') return;
			finish({ ok: event.data.status === 'success', message: event.data.message });
		}

		window.addEventListener('message', onMessage);

		// Detect the user closing the popup without completing the flow.
		pollTimer = setInterval(() => {
			if (popup.closed) finish({ ok: false, message: 'Authorization was cancelled.' });
		}, 500);

		api(`/oauth2/authorize/${credentialId}`)
			.then(async (res) => {
				const body = await res.json();
				const authorizationUrl = body?.data?.authorizationUrl as string | undefined;

				if (!body.success) {
					popup.close();
					finish({ ok: false, message: body.error ?? 'Could not start authorization.' });
					return;
				}

				// Empty URL → clientCredentials grant: tokens were exchanged server-side
				// already, so there is nothing to show in the popup.
				if (!authorizationUrl) {
					popup.close();
					finish({ ok: true, immediate: true });
					return;
				}

				popup.location.href = authorizationUrl;
			})
			.catch(() => {
				popup.close();
				finish({ ok: false, message: 'Unexpected error starting authorization.' });
			});
	});
}

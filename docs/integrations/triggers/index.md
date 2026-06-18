# App Triggers

App triggers fire a [workflow](/guide/workflows/) the moment something happens in a connected app — a new Gmail message arrives, a Notion database item changes, a new Google Form response is submitted, a Slack message is posted. Unlike a [generic webhook](/guide/workflows/triggers#webhook) (where you wire and parse everything yourself), each app is a built-in **provider** that knows how to listen for its events and hand the workflow a clean, documented payload.

## Available triggers

| App                                                 | Event                            | Delivery                    | Extra setup                                      |
| --------------------------------------------------- | -------------------------------- | --------------------------- | ------------------------------------------------ |
| [Gmail](/integrations/triggers/gmail)               | New email received               | Push (Google Cloud Pub/Sub) | One-time Pub/Sub topic + push subscription       |
| [Notion](/integrations/triggers/notion)             | Database item created or updated | Push (Notion webhook)       | Add the delivery URL in your Notion integration  |
| [Slack](/integrations/triggers/slack)               | New message                      | Push (Events API)           | Auto-register via Manifest API, or paste the URL |
| [Google Forms](/integrations/triggers/google-forms) | New form response                | Polling                     | None beyond the credential                       |

Each trigger uses one of your [credentials](/guide/credentials) of the matching type. The credential authenticates the _listener_, so any credential of the right type works — it need not be attached to the agent that owns the workflow.

## How it works

A provider abstracts away the three ways apps deliver events:

- **Push (webhook).** The app calls Valmis when something happens. Gmail pushes through Google Cloud Pub/Sub; Notion and Slack post directly to a delivery URL. Push triggers are near-instant.
- **Polling.** Valmis asks the app for new items on an interval. Google Forms is polled (default every 60s, configurable in the builder).

Whatever the mechanism, each event becomes **one workflow run**, and the provider maps the raw event to **normalized fields plus a `raw` escape hatch** (the original API object) delivered as <code v-pre>{{trigger.payload}}</code>. Use the normalized fields for clean instructions and reach into `raw` only when you need something the normalization didn't surface.

| App              | <code v-pre>{{trigger.payload}}</code> shape                                                 |
| ---------------- | -------------------------------------------------------------------------------------------- |
| **Gmail**        | `{ from, to, subject, snippet, body, receivedAt, messageId, threadId, labels, raw }`         |
| **Notion**       | `{ pageId, databaseId, url, properties, changedProperties, lastEditedTime, eventType, raw }` |
| **Slack**        | `{ channel, user, text, ts, eventType, raw }`                                                |
| **Google Forms** | `{ formId, responseId, submittedAt, answers, raw }`                                          |

## Adding an app trigger

In the workflow builder's trigger card, choose **App event**, then pick:

1. **App** — the provider (Gmail, Notion, Slack, Google Forms).
2. **Credential** — a credential of the matching type. See the per-app page for which credential and scopes it needs.
3. **Event** — what to fire on (e.g. _New email received_).
4. **Parameters** — event-specific fields. Where the app supports it, these are **searchable dropdowns** populated live from your account using the selected credential: pick a Gmail label, one or more Notion databases, or one or more Slack channels by name instead of pasting ids. Each dropdown also accepts a manually typed id as a fallback. (Google Forms is the exception — the Forms API can't list a user's forms, so you enter the form id directly.)

For the **push** apps, **save the workflow first** — the builder then reveals the **delivery URL** (`<APP_URL>/api/v1/webhooks/<triggerId>`) to register with the app. Where the app has an API for it (Slack's Manifest API, Gmail's `watch`), Valmis registers and renews the subscription for you; otherwise you paste the URL once. Each provider's page has the exact steps.

## Delivery & security

Each push provider verifies its **own** inbound requests, so the delivery URL is safe to hand to the external service:

- **Gmail** — validates the Google Cloud Pub/Sub envelope; the push only carries a history id, and the message is always re-fetched from the authenticated Gmail API (a spoofed delivery cannot inject content).
- **Slack** — verifies the **signing secret** (HMAC over the raw request body).
- **Notion** — verifies the **`X-Notion-Signature`** (HMAC with the verification token captured during setup).

::: tip First run won't replay history
Polling apps (Google Forms) record a baseline on activation and only fire for items that arrive **after** the trigger is enabled — turning a trigger on does not flood you with every past response.
:::

::: warning Auto-disable on repeated failure
Like cron triggers, an app trigger that fails to listen 5 times in a row (e.g. an expired credential or a revoked subscription) is automatically disabled. Fix the cause and re-enable the workflow.
:::

## Lifecycle

Push subscriptions are managed for you across the workflow's life:

- **Enable / save** — the subscription is (re-)registered and, where it expires (e.g. Gmail's 7-day `watch`), auto-renewed before it lapses.
- **Disable / pause** — the subscription is unregistered and timers cleared.
- **Delete** — the subscription is removed and all state cleaned up.
- **Delete the credential** — every app trigger using it is stopped.

## Registration status

After you save a webhook trigger, the builder shows one of three states inline:

- **✓ Registered automatically** (green) — Valmis created the subscription through the app's API. Only **Gmail** and **Slack with a config token** reach this state.
- **⚠ Manual setup required** (amber) — the app has no create-webhook API (or the needed credentials aren't set), so you must add the **delivery URL** in the app yourself. This is normal for **Notion** (always) and **Slack without a config token**. The delivery URL is shown right above the status.
- **⚠ Setup failed** (red) — registration was attempted but errored (e.g. an expired credential, a non-HTTPS `APP_URL`, or missing scopes). The message says why.

Use the **Re-check registration** button (shown in edit mode) to re-attempt registration and refresh the status after you've completed manual setup or fixed the cause — no need to re-save the whole workflow.

To confirm from the server side, grep the backend logs for `[app-trigger]`:

- `[app-trigger] webhook registered` — auto-registration succeeded.
- `[app-trigger] Slack manifest auto-register skipped (no appId/configToken) — manual setup` — Slack is in manual mode.
- `[app-trigger] Notion webhook is configured in the integration settings (no API auto-register)` — Notion is in manual mode (always).
- `[app-trigger] webhook registration failed` — registration errored (the line includes the reason).

## Testing locally (tunneling)

External apps (Slack, Notion, Gmail Pub/Sub) must reach Valmis over the **public internet via HTTPS**. The delivery URL is built from `APP_URL` (default `http://localhost:3000`), which an external service **cannot** reach — and Slack/Notion reject non-HTTPS URLs. To test app triggers on your machine, expose the app through a tunnel:

1. Start a tunnel to your running app (port `3000` by default):

   ```sh
   ngrok http 3000
   # or
   cloudflared tunnel --url http://localhost:3000
   ```

2. Set `APP_URL` to the tunnel's HTTPS host and **restart the backend** so new delivery URLs use it:

   ```sh
   APP_URL=https://<your-tunnel-host>
   ```

3. Save (or re-save) the workflow. The delivery URL is now `https://<your-tunnel-host>/api/v1/webhooks/<triggerId>` — reachable by the external app.

4. Complete any **manual setup** (Notion always; Slack without a config token) by pasting that URL into the app, then click **Re-check registration**.

::: tip Inbound requests are verified, not authenticated
The delivery URL needs no API key — it's intentionally public so apps can POST to it. Security comes from the unguessable `triggerId` plus each provider verifying every delivery cryptographically (Slack signing secret, Notion `X-Notion-Signature`, Gmail Pub/Sub envelope). Unverified or unknown requests get a generic `401`.
:::

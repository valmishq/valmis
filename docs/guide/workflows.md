# Workflows

Workflows turn an agent into an automation: an ordered pipeline of steps, each a full agent turn with its own instruction and constraints, fired by a manual click, a cron schedule, a generic webhook, or an event in a connected app (a Gmail message arrives, a Notion database item changes, a Google Form is submitted, a Slack message is posted). Workflow runs are recorded with per-step logs you can watch live.

Workflows belong to an agent — manage them from **Agents → workflow icon**.

## Building a workflow

**Workflows → Create new workflow** opens the builder:

- **Name** and optional description
- **Trigger** — exactly one per workflow (see below)
- **Steps** — an ordered list; add, edit, and remove steps as collapsible cards
- An **enabled** toggle on the list page — disabled workflows cannot be triggered

### Steps

Each step is one agent turn. Per step you configure:

| Setting                 | Description                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Instruction**         | What this step should do — the step's prompt. Supports template variables (below).                                                 |
| **Allowed tools**       | Restrict which [built-in tools](/guide/tools) the step may use.                                                                    |
| **Allowed credentials** | Restrict which of the agent's credentials the step may use.                                                                        |
| **Output schema**       | Optional JSON schema the step's output must conform to — useful when a later step parses the result.                               |
| **Error handling**      | What to do if the step fails: **stop** the run, **continue** to the next step, or **retry** up to a configured number of attempts. |

### Template variables

Step instructions can reference earlier context:

| Variable                                          | Resolves to                                                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| <code v-pre>{{trigger.payload}}</code>            | The payload the trigger delivered (e.g. a webhook body or the payload passed to `trigger_workflow`). |
| <code v-pre>{{steps.&lt;index&gt;.output}}</code> | The final output of an earlier step, by zero-based index.                                            |

## Triggers

Every workflow has exactly one trigger, chosen in the builder:

### Manual

Run the workflow with a button (or have the agent itself start it with the `trigger_workflow` tool from chat).

### Cron

Runs on a schedule. Configure a cron expression with the schedule picker and an IANA timezone (e.g. `Europe/Berlin`).

::: warning Auto-disable on repeated failure
A cron trigger that fails 5 times in a row is automatically disabled to prevent silent error loops. Re-enable the workflow after fixing the cause.
:::

### Webhook

Gives the workflow an HTTP endpoint. In edit mode the builder shows the **webhook URL** and an **HMAC secret**, both with copy buttons. The JSON request body and request headers become <code v-pre>{{trigger.payload}}</code> (as `body` and `headers`).

By default, callers must sign requests with HMAC-SHA256 using the secret — unsigned or incorrectly signed requests are rejected:

```sh
SIGNATURE=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')
curl -X POST "$WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d "$BODY"
```

If the service calling your webhook cannot sign requests, switch off **Require signed requests** in the builder's trigger card. The endpoint then accepts any request to the URL.

::: warning Unsigned webhooks
With signature verification off, anyone who knows the webhook URL can trigger the workflow. Treat the URL itself as a secret.
:::

A successful delivery returns `202 Accepted` with the started run's ID:

```json
{ "success": true, "data": { "received": true, "runId": "…", "workflowId": "…" } }
```

Rejected requests return `401` (unknown trigger, disabled workflow, or bad signature), `400` for a non-JSON body, and `503` if the runtime could not be started (safe to retry).

### App event

App triggers run the workflow when something happens in a connected app — a new Gmail message, a Notion database item change, a new Google Form response, a Slack message. Unlike a generic webhook (where you wire and parse everything yourself), each app is a built-in **provider** that knows how to listen for its events and hand the workflow a clean, documented payload. See the [App Triggers reference](/integrations/triggers/) for the full provider list and per-app setup.

In the builder's trigger card, choose **App event**, then pick:

1. **App** — the provider (Gmail, Notion, Slack, Google Forms).
2. **Credential** — a credential of the matching type (see the per-app setup below). App-trigger credentials authenticate the _listener_, so any of your credentials of the right type works — it need not be attached to the agent.
3. **Event** — what to fire on (e.g. _New email received_).
4. **Parameters** — event-specific fields (e.g. a Gmail label, a Notion database id, a Google Form id, a Slack channel id).

#### Event payload

Each event becomes one workflow run. The provider maps the event to **normalized fields plus a `raw` escape hatch** (the original API object), delivered as <code v-pre>{{trigger.payload}}</code>:

| App              | Event                            | <code v-pre>{{trigger.payload}}</code> shape                                                  |
| ---------------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| **Gmail**        | New email received               | `{ from, to, subject, snippet, body, receivedAt, messageId, threadId, labels, raw }`          |
| **Notion**       | Database item created or updated | `{ pageId, databaseId, url, properties, changedProperties, lastEditedTime, eventType, raw }`   |
| **Slack**        | New message                      | `{ channel, user, text, ts, eventType, raw }`                                                  |
| **Google Forms** | New form response                | `{ formId, responseId, submittedAt, answers, raw }`                                            |

#### How each app listens

| App              | Delivery                       | Notes                                                                                                       |
| ---------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Gmail**        | Push (Google Cloud Pub/Sub)    | Registers a Gmail `watch` and auto-renews it; needs a Pub/Sub topic + push subscription (one-time setup).   |
| **Notion**       | Push (Notion webhook)          | You add the delivery URL once in your Notion integration; the verification token is captured automatically. |
| **Slack**        | Push (Events API)              | Auto-registers the request URL via the App Manifest API when a config token is set; else paste it manually. |
| **Google Forms** | Polling                        | Checks for new responses on an interval (default 60s, configurable).                                        |

For the push apps, save the workflow first — the builder then shows the **delivery URL** (`<APP_URL>/api/v1/webhooks/<triggerId>`) to register with the app. Each provider verifies its own inbound requests (Gmail Pub/Sub envelope, Slack signing secret, Notion signature), so the URL is safe to give to the external service. The exact provider setup lives on its trigger page: [Gmail](/integrations/triggers/gmail), [Notion](/integrations/triggers/notion), [Slack](/integrations/triggers/slack), [Google Forms](/integrations/triggers/google-forms).

::: tip First run won't replay history
Polling apps (Google Forms) record a baseline on activation and only fire for items that arrive **after** the trigger is enabled — turning a trigger on does not flood you with every past response.
:::

::: warning Auto-disable on repeated failure
Like cron triggers, an app trigger that fails to listen 5 times in a row (e.g. an expired credential) is automatically disabled. Fix the cause and re-enable the workflow.
:::

## Runs and observability

Each trigger firing creates a **run**. From the workflow list:

- **Run history** — a table of all runs with status and timing.
- **Run detail** — a live view of a single run: status, trigger type, duration (ticking in real time while running), and a step-by-step timeline. Each step row shows its status, duration, and expandable input/output. The page polls every few seconds while the run is in progress.

Workflow runs execute in regular conversation threads, hidden behind the **workflow filter** toggle in the [chat sidebar](/guide/chat#thread-management) — flip it on to read a run's full transcript, including tool calls.

Run costs and tokens are included in the agent's [activity dashboard](/guide/agents#activity-and-cost-tracking).

## Agents managing their own workflows

In chat, an agent can list, read, and trigger its own enabled workflows — and even create new ones — through the [workflow tools](/guide/tools#workflows). Creation is gated: the agent must show you the full proposed configuration and get your explicit confirmation through a human-in-the-loop prompt first.

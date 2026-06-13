# Workflows

Workflows turn an agent into an automation: an ordered pipeline of steps, each a full agent turn with its own instruction and constraints, fired by a manual click, a cron schedule, or a webhook. Workflow runs are recorded with per-step logs you can watch live.

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

## Runs and observability

Each trigger firing creates a **run**. From the workflow list:

- **Run history** — a table of all runs with status and timing.
- **Run detail** — a live view of a single run: status, trigger type, duration (ticking in real time while running), and a step-by-step timeline. Each step row shows its status, duration, and expandable input/output. The page polls every few seconds while the run is in progress.

Workflow runs execute in regular conversation threads, hidden behind the **workflow filter** toggle in the [chat sidebar](/guide/chat#thread-management) — flip it on to read a run's full transcript, including tool calls.

Run costs and tokens are included in the agent's [activity dashboard](/guide/agents#activity-and-cost-tracking).

## Agents managing their own workflows

In chat, an agent can list, read, and trigger its own enabled workflows — and even create new ones — through the [workflow tools](/guide/tools#workflows). Creation is gated: the agent must show you the full proposed configuration and get your explicit confirmation through a human-in-the-loop prompt first.

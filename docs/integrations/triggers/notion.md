# Notion App Trigger

Fire a [workflow](/guide/workflows/) when a page in a chosen database is **created or has its properties updated** (e.g. a status change). Notion delivers these as webhook events; the subscription is created in the Notion integration UI (Notion has no API to create it), but verification and routing are automatic.

| | |
| --------------- | ------------------------------------------------------------------ |
| **Event**       | Database item created or updated                                    |
| **Delivery**    | Push (Notion webhook → `<APP_URL>/api/v1/webhooks/<triggerId>`)     |
| **Credential**  | [Notion](/integrations/notion) — internal integration token or OAuth2 |
| **Payload**     | `{ pageId, databaseId, url, properties, changedProperties, lastEditedTime, eventType, raw }` |

## Prerequisites

A [Notion credential](/integrations/notion) (internal token or OAuth2), and the integration must have access to the target database (**⋯ menu → Connections** on the database).

## Add the trigger

1. In the workflow builder, add a **Notion** app trigger and choose **Database item created or updated**.
2. Pick your Notion credential.
3. Choose one or more **Databases** from the dropdown — it lists the databases your credential can access; search by name, select several, or paste an id manually if needed. The trigger fires for changes in any selected database. Optionally enable **Include content edits**.
4. **Save the workflow** to reveal the **delivery URL** (`<APP_URL>/api/v1/webhooks/<triggerId>`).
5. In your Notion integration's settings, add that URL as a **Webhook subscription**. Notion sends a one-time **verification token** to the URL, which Agent-Int captures.
6. Back in the builder, click **Re-check registration** — the captured **Verification token** appears with a copy button. Copy it and paste it into Notion to confirm the subscription. (It is also written to the backend logs as `captured Notion verification token` as a fallback.)

Once verified, events are checked against Notion's `X-Notion-Signature` (HMAC with the verification token), the changed page is fetched and filtered to your database, and delivered as the payload below.

::: tip Notion always shows "Manual setup required"
Notion has no API to create a webhook, so after saving the builder shows an amber **Manual setup required** status (not a green "registered automatically") — this is expected. Add the delivery URL in Notion as above, then click **Re-check registration**. If you're testing locally, the delivery URL must be a public HTTPS address — see [Testing locally](/integrations/triggers/#testing-locally-tunneling).
:::

## Payload

Each create/update is delivered as <code v-pre>{{trigger.payload}}</code>:

```json
{
  "pageId": "…",
  "databaseId": "…",
  "url": "https://www.notion.so/…",
  "properties": { "Status": "In progress", "Owner": "Alice" },
  "changedProperties": ["Status"],
  "lastEditedTime": "2026-06-14T10:32:00.000Z",
  "eventType": "page.properties_updated",
  "raw": { "…": "the original Notion event + page object" }
}
```

::: tip Filter further in a step
The trigger fires for any create/update in the database. To act only on a specific status, check `changedProperties` or `properties` in your first step's instruction (or its output schema) and stop early when it doesn't match.
:::

See also: the [Notion integration page](/integrations/notion) for creating the credential, and the [App Triggers overview](/integrations/triggers/) for the shared lifecycle and security model.

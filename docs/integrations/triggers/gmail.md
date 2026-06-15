# Gmail App Trigger

Fire a [workflow](/guide/workflows/) when a new email arrives. Gmail pushes notifications through **Google Cloud Pub/Sub** rather than polling, so it needs a one-time Pub/Sub setup in the same Cloud project as your Gmail credential.

| | |
| --------------- | ------------------------------------------------------------------ |
| **Event**       | New email received                                                  |
| **Delivery**    | Push (Google Cloud Pub/Sub → `<APP_URL>/api/v1/webhooks/<triggerId>`) |
| **Credential**  | [Gmail](/integrations/google) (OAuth2) — `gmail.readonly` is enough for the trigger |
| **Payload**     | `{ from, to, subject, snippet, body, receivedAt, messageId, threadId, labels, raw }` |

## Prerequisites

A [Gmail credential](/integrations/google) created and authorized. The trigger only reads mail, so if a credential is used _solely_ for the trigger the `gmail.readonly` scope suffices — but the standard Gmail integration already requests enough.

## One-time Pub/Sub setup

Do this once per Cloud project; all Gmail triggers in that project can share the topic.

1. **Enable the Cloud Pub/Sub API** in **APIs & Services → Library**.
2. **Create a topic** in **Pub/Sub → Topics** (e.g. `gmail-push`). Its full name is `projects/<project>/topics/<topic>`.
3. **Grant Gmail permission to publish**: on the topic, **Add principal** `gmail-api-push@system.gserviceaccount.com` with the role **Pub/Sub Publisher**.
4. **Create a push subscription** on the topic with delivery type **Push**, and set the endpoint URL to the workflow's delivery URL — shown in the builder after you save the workflow:

   ```
   <APP_URL>/api/v1/webhooks/<triggerId>
   ```

## Add the trigger

1. In the workflow builder, add a **Gmail** app trigger and choose **New email received**.
2. Pick your Gmail credential.
3. Set the **Pub/Sub topic** (full name from step 2), or set the server default `GOOGLE_PUBSUB_TOPIC` and leave it blank.
4. Optionally restrict it to a **Label** using the dropdown — it lists your Gmail labels (e.g. `INBOX`); search or pick one, or paste a label id manually.
5. **Save the workflow.** Copy the delivery URL it now shows into the Pub/Sub push subscription (step 4 above).

Agent-Int calls Gmail `users.watch` when the trigger activates and re-issues it automatically before the 7-day watch expires. The push notification only carries a history id — the actual message is always re-fetched from the authenticated Gmail API, so a spoofed delivery cannot inject email content.

## Payload

Each matching email is delivered as <code v-pre>{{trigger.payload}}</code>:

```json
{
  "from": "alice@example.com",
  "to": "you@example.com",
  "subject": "Invoice #1234",
  "snippet": "Please find attached…",
  "body": "Please find attached the invoice for…",
  "receivedAt": "2026-06-14T10:32:00.000Z",
  "messageId": "18f…",
  "threadId": "18f…",
  "labels": ["INBOX", "IMPORTANT"],
  "raw": { "…": "the original Gmail message resource" }
}
```

::: tip Read-only is enough for triggering
The Gmail integration requests full scopes for agent actions, but the trigger only reads. A credential used _solely_ for the trigger needs only `gmail.readonly`.
:::

See also: the [Google integration page](/integrations/google) for creating the credential, and the [App Triggers overview](/integrations/triggers/) for the shared lifecycle and security model.

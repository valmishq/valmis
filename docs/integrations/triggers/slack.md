# Slack App Trigger

Fire a [workflow](/guide/workflows) when a message is posted to a channel the app is subscribed to (via the Slack **Events API**).

| | |
| --------------- | ------------------------------------------------------------------ |
| **Event**       | New message                                                         |
| **Delivery**    | Push (Slack Events API → `<APP_URL>/api/v1/webhooks/<triggerId>`)   |
| **Credential**  | [Slack](/integrations/slack) (OAuth2) — **Signing Secret required** |
| **Payload**     | `{ channel, user, text, ts, eventType, raw }`                       |

## Prerequisites

### Signing Secret (required)

Add your app's **Signing Secret** (**Basic Information → App Credentials**) to the [Slack credential](/integrations/slack). Agent-Int verifies every inbound event with it (HMAC over the raw request body), so the trigger will not work without it. Credentials used purely for agent actions (sending messages, etc.) don't need it.

### Required scopes

The **New message** event maps to Slack's `message.channels` bot event, and Slack only lets an app subscribe to an event when the app **declares the matching scope**. Your Slack app's **Bot Token Scopes** (OAuth & Permissions) must include:

- **`channels:history`** — required to receive message events and read their text. Without it the subscription is rejected.
- `channels:read` (and `groups:read` for private channels) — so the builder's **Channels** dropdown can list your channels; without them it errors and you paste channel ids manually.
- For private channels and DMs, also add `groups:history` / `im:history` / `mpim:history`.

`channels:history` is in Agent-Int's default scope list — but if you trimmed it, or created the Slack app without it, add it to the Slack app and reinstall / re-authorize the credential before registering.

::: warning Auto-registration validates scopes
With automatic registration (below), Slack checks that every subscribed event has its scope. If `channels:history` isn't already declared on your app, `apps.manifest.update` fails with **`invalid_manifest`**. Add the scope to the app first, then click **Re-check registration**.
:::

### Optional credential fields (for automatic setup)

These Slack credential fields are only used by the trigger, and only when you want Agent-Int to register the request URL for you. Leave them blank to use manual setup instead.

| Field | What it does | Where to find it |
| --- | --- | --- |
| **App Manifest Config Token** (`xoxe.xoxp-…`) | Lets Agent-Int read and update your app's manifest to set the Events **request URL** and subscribe `message.channels`. | Generate under [App Configuration Tokens](https://api.slack.com/reference/manifests#config-tokens) (**Your Apps → App configuration tokens**). |
| **App Manifest Refresh Token** (`xoxe-1-…`) | The matching refresh token; config tokens expire (~12h) and Agent-Int rotates them for you. | Issued as a pair with the config token. |
| **Slack App ID** (`A0…`) | Identifies which app's manifest to update. | Slack app → **Basic Information → App ID** (not the Client ID). |

Provide **all three** to enable automatic registration; with any missing, the trigger falls back to manual setup. The **Signing Secret** above is required either way.

## Add the trigger

1. In the workflow builder, add a **Slack** app trigger (the event is **New message**).
2. Pick your Slack credential.
3. Optionally restrict it to specific **Channels** using the dropdown — search by name, select one or more, or paste an id manually. Leave it empty to fire for all channels. Bot and edited messages are ignored.
4. **Save the workflow** — the builder then shows the **delivery URL** (`<APP_URL>/api/v1/webhooks/<triggerId>`).

## Registering the request URL

There are two ways to register the delivery URL with Slack:

- **Manual (simplest).** In your Slack app, go to **Event Subscriptions**, turn it on, paste the delivery URL as the **Request URL** (Slack verifies it with a challenge that Agent-Int answers automatically), and subscribe the bot event **`message.channels`**. Reinstall the app if Slack prompts you. After saving, the builder shows an amber **Manual setup required** status until you do this — paste the URL, then click **Re-check registration**.
- **Automatic (optional).** Provide the **App Manifest config token + refresh token** and the **App ID** on the credential (see [Optional credential fields](#optional-credential-fields-for-automatic-setup)). Agent-Int then sets the request URL and subscribes the event for you via the Manifest API, rotating the short-lived config token (~12h) as needed, and the builder shows a green **Registered automatically** status. Your app must already declare the **`channels:history`** scope, or this step fails with `invalid_manifest` (see [Required scopes](#required-scopes)).

::: tip Testing locally
The delivery URL must be a public HTTPS address — Slack rejects `localhost` and non-HTTPS request URLs. Use a tunnel; see [Testing locally](/integrations/triggers/#testing-locally-tunneling).
:::

## Payload

Each message arrives as <code v-pre>{{trigger.payload}}</code>:

```json
{
  "channel": "C0123456789",
  "user": "U0123456789",
  "text": "Can someone review PR #42?",
  "ts": "1718360000.000100",
  "eventType": "message",
  "raw": { "…": "the original Slack event_callback object" }
}
```

See also: the [Slack integration page](/integrations/slack) for creating the credential (Signing Secret, config token, refresh token, App ID fields), and the [App Triggers overview](/integrations/triggers/) for the shared lifecycle and security model.

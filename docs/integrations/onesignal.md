# OneSignal

Lets agents send and manage **OneSignal** messaging — **push, email, and SMS notifications, plus apps and subscriptions**. Authenticates with an API key sent using the `Key` authorization scheme.

[OneSignal keys & IDs documentation](https://documentation.onesignal.com/docs/en/keys-and-ids)

## What you need

| Field   | Required | Notes                                                                       |
| ------- | -------- | --------------------------------------------------------------------------- |
| API Key | Yes      | Secret — an **Organization API key** can list all apps (used by the test)   |
| App ID  | No       | The app to operate on; required for sending notifications and app-scoped calls |

## Getting your keys

1. Sign in to OneSignal and open **Settings → Keys & IDs** for your app to find the **App ID** and an **App API Key**.
2. For the connection test (and to manage multiple apps), use an **Organization API Key** from **Organizations → Keys & IDs**.
3. Paste the key into the credential form, and add the **App ID** if the agent will send notifications.

::: warning Use the new "Key" scheme
OneSignal replaced the old `Basic <key>` scheme with `Key <key>` in late 2024 (base URL `https://api.onesignal.com`). The credential uses the current scheme automatically — just make sure you copy a current API key, not a legacy one.
:::

::: tip The connection test needs an Organization key
The test lists your organization's apps, which requires an **Organization API key**. An app-level key still works for sending notifications to its own app, but will fail the org-level test.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List the OneSignal apps in our organization."
- "Send a push notification 'Order shipped' to all subscribers of app X."
- "How many subscribed devices does this app have?"

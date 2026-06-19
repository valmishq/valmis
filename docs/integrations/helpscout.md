# Help Scout

Lets agents work with **Help Scout** (Mailbox) — **conversations, customers, and mailboxes**. Authenticates via OAuth2 using the client-credentials grant, so an access token is minted directly from your app's ID and secret — no browser redirect.

[Help Scout Mailbox API authentication documentation](https://developer.helpscout.com/mailbox-api/overview/authentication/)

## What you need

| Field                   | Required | Notes                       |
| ----------------------- | -------- | --------------------------- |
| App ID (Client ID)      | Yes      | From your Help Scout app    |
| App Secret (Client Secret) | Yes   | Secret — from your Help Scout app |

## Setting up the app

1. Sign in to Help Scout and open **Your Profile → My Apps**.
2. Click **Create My App**, give it a name, and (the redirect URL field can be any valid URL — it isn't used by this grant).
3. Copy the **App ID** and **App Secret** into the credential form.
4. Save the credential and click **Authorize** — Valmis exchanges the App ID/Secret for an access token directly. No browser redirect or consent screen appears.

::: tip Client-credentials grant — app-owned access
Unlike most OAuth2 integrations, Help Scout here uses the **client-credentials** grant: the token represents your app, not an individual user, so there's no redirect step. Valmis refreshes the token automatically when it expires (about every 48 hours).
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List our Help Scout mailboxes."
- "How many conversations are currently unassigned in the Support mailbox?"
- "Find the latest conversation from customer@example.com and summarize the thread."

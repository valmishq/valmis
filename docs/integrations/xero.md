# Xero

Lets agents work with your Xero accounting organisation — **invoices, bills, contacts, bank transactions, and accounts**. Authenticates via OAuth2, with the access token sent as a Bearer token.

[Xero OAuth2 documentation](https://developer.xero.com/documentation/guides/oauth2/overview/)

## What you need

| Field         | Required | Notes                                      |
| ------------- | -------- | ------------------------------------------ |
| Client ID     | Yes      | From your Xero app                          |
| Client Secret | Yes      | Secret — from your Xero app                 |

## Setting up the app

1. Sign in at [developer.xero.com](https://developer.xero.com/) and create an app under **My Apps** (choose **Web app**).
2. Copy the **Client ID** and **Client Secret** into the credential form.
3. Add the redirect URI shown on the credential form as the app's **OAuth 2.0 redirect URI**: `<APP_URL>/oauth2/callback`.
4. Save the credential, click **Authorize**, and grant access to your Xero organisation.

::: tip Choosing the organisation
Xero accounts can hold several organisations. After authorizing, the agent calls `GET https://api.xero.com/connections` to list the organisations it can access, then sends the chosen organisation's **tenant id** as a `Xero-tenant-id` header on each request. Ask the agent which organisations are connected if you're unsure which one it's using.
:::

::: info Scopes requested
Valmis requests `openid email profile offline_access accounting.transactions accounting.contacts accounting.settings`. `offline_access` is what lets the credential refresh itself without re-authorizing.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "Which organisations is this Xero connection authorized for?"
- "Create a draft sales invoice for the contact 'Blue Ridge Ltd' for \$2,400."
- "List all bills due in the next 14 days with their amounts."

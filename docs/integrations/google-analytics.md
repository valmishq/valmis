# Google Analytics (GA4)

Lets agents query **Google Analytics 4** — **run reports with the Data API and list accounts and properties**. Authenticates via Google OAuth2, with the access token sent as a Bearer token.

[Google Analytics Data API documentation](https://developers.google.com/analytics/devguides/reporting/data/v1)

## What you need

| Field         | Required | Notes                                      |
| ------------- | -------- | ------------------------------------------ |
| Client ID     | Yes      | OAuth2 Client ID from Google Cloud Console |
| Client Secret | Yes      | Secret — OAuth2 Client Secret              |

## Setting up the app

Google Analytics uses **Google Cloud project and OAuth client like every other Google integration**. Follow the shared [Google setup guide](/integrations/google) to create the Cloud project, configure the OAuth consent screen, and create the OAuth client — with these GA-specific points:

- **Step 2 — Enable the APIs:** enable both the **Google Analytics Data API** and the **Google Analytics Admin API**.
- **Step 3 — Consent screen:** add the `https://www.googleapis.com/auth/analytics.readonly` scope (Valmis also requests `openid email`).
- **Step 4 — OAuth client:** add the redirect URI shown on the credential form: `<APP_URL>/oauth2/callback`.

Then create the credential in Valmis: paste the **Client ID** and **Client Secret**, save, click **Authorize**, and sign in with a Google account that has access to your GA4 property. The same Client ID/Secret can be reused across every Google integration.

::: tip You pick the property per request
GA4 reports run against a **property ID** (e.g. `properties/123456789`). The agent supplies it per request — tell the agent which property to report on, or ask it to list your accounts and properties first.
:::

::: info Read-only scope
Valmis requests `analytics.readonly` (plus `openid email`), so the agent can read reports and configuration but not change your Analytics setup.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List the GA4 accounts and properties I can access."
- "For property 123456789, how many active users did we have in the last 28 days?"
- "Show the top 10 landing pages by sessions for property 123456789 this month."

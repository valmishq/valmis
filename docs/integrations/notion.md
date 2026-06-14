# Notion

Lets agents read and write pages and databases in your Notion workspace. Two credential variants — the **internal integration token** is the simple, recommended path for your own workspace.

[Notion authorization documentation](https://developers.notion.com/docs/authorization)

## Option 1: Internal Integration Token (recommended)

**Credential type:** Notion (API Key) — sent as a Bearer token.

| Field                      | Required | Notes                          |
| -------------------------- | -------- | ------------------------------ |
| Internal Integration Token | Yes      | Secret — starts with `secret_` |

### Getting the token

1. Open [notion.so/my-integrations](https://www.notion.so/my-integrations) and click **New integration**.
2. Choose type **Internal**, pick the workspace, and set the capabilities (read/insert/update content).
3. Copy the **Internal Integration Secret** into the credential form.

::: warning Share pages with the integration
A Notion integration sees **nothing** by default. In Notion, open each page or database the agent should access → **⋯ menu → Connections** → add your integration. Forgetting this step is the most common cause of empty results.
:::

## Option 2: OAuth2 (public integration)

**Credential type:** Notion (OAuth2) — for cross-workspace public integrations where users grant access without sharing a token.

| Field               | Required | Notes                                           |
| ------------------- | -------- | ----------------------------------------------- |
| OAuth Client ID     | Yes      | Integration dashboard → **Secrets → Client ID** |
| OAuth Client Secret | Yes      | Secret — same place, **OAuth client secret**    |

### Setting it up

1. At [notion.so/my-integrations](https://www.notion.so/my-integrations), create an integration of type **Public**.
2. Register the redirect URI from the credential form: `<APP_URL>/oauth2/callback`.
3. Copy the client ID and secret into the credential form.
4. Save, click **Authorize**, and pick the workspace and pages to grant.

## App triggers

A Notion credential can fire a workflow when a page in a chosen database is **created or has its properties updated** (e.g. a status change). Notion delivers these as webhook events — you add the delivery URL as a webhook subscription in the Notion integration UI (it sends a one-time verification token, captured automatically), and verification, filtering, and routing are handled for you. The full setup and payload shape live on the [Notion app trigger page](/integrations/triggers/notion).

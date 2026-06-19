# Webflow

Lets agents manage **sites, CMS collections, and items** through the Webflow Data API (v2). Authenticates with a Site API token, sent as a Bearer token.

[Webflow Data API authentication documentation](https://developers.webflow.com/data/reference/authentication)

## What you need

| Field     | Required | Notes  |
| --------- | -------- | ------ |
| API Token | Yes      | Secret |

## Getting your API token

1. In Webflow, open **Site settings → Apps & integrations → API access**.
2. Click **Generate API token**, name it, and select the scopes the agent needs — include **authorized_user:read** so the connection test can verify the token.
3. Copy the token into the credential form — it is shown only once.

::: tip One token per site
A Site API token is scoped to the single site it was created in (max five per site). For multiple sites, create a separate credential per site.
:::

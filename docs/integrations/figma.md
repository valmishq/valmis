# Figma

Lets agents read **files, projects, comments, and components** in Figma. Two ways to connect: a **personal access token** (fastest, for your own account) or **OAuth2** (so users grant access to their own Figma without sharing a token).

[Figma REST API documentation](https://developers.figma.com/docs/rest-api/)

## Option A — Personal access token

Sent in the `X-Figma-Token` header (not a Bearer token).

| Field                 | Required | Notes  |
| --------------------- | -------- | ------ |
| Personal Access Token | Yes      | Secret |

1. In Figma, open the account menu → **Settings → Security**.
2. Under **Personal access tokens**, click **Generate new token**, set an expiration, and grant scopes — include **current_user:read** so the connection test can verify the token.
3. Copy the token into the credential form — it is shown only once.

[Figma personal access token documentation](https://developers.figma.com/docs/rest-api/personal-access-tokens/)

## Option B — OAuth2

For granting access to another user's Figma account. The OAuth access token is sent as a Bearer token.

| Field             | Required | Notes  |
| ----------------- | -------- | ------ |
| OAuth Client ID   | Yes      | From your Figma OAuth app |
| OAuth Client Secret | Yes    | Secret — from your Figma OAuth app |

1. In Figma, open **Settings → OAuth apps** and create an app.
2. Register the redirect URI `<APP_URL>/oauth2/callback` (the credential form shows it with a copy button).
3. Copy the **Client ID** and **Client Secret** into the credential form, then complete the authorization flow.

[Figma OAuth apps documentation](https://developers.figma.com/docs/rest-api/oauth-apps/)

::: warning OAuth tokens expire after 90 days
Figma OAuth access tokens last 90 days. Automatic refresh is not yet wired up for Figma, so an OAuth credential must be re-authorized after it expires. If you only need your own account, prefer the personal access token, which you control directly.
:::

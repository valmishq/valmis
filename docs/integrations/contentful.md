# Contentful

Lets agents create and edit **entries, assets, and content types** via the Contentful Content Management API (CMA). Authenticates with a personal CMA token, sent as a Bearer token.

[Contentful authentication documentation](https://www.contentful.com/developers/docs/references/authentication/)

## What you need

| Field        | Required | Notes                                                              |
| ------------ | -------- | ------------------------------------------------------------------ |
| CMA Token    | Yes      | Secret — Content Management API personal access token              |
| API Base URL | Yes      | Global `https://api.contentful.com`, or EU `https://api.eu.contentful.com` |
| Space ID     | Yes      | The Space the agent should operate on                              |

## Getting your CMA token

1. Sign in to Contentful and open **Settings → CMA tokens** (or **API keys**).
2. Click **Create personal access token**, name it, and copy it — it is shown only once.
3. Find your **Space ID** under **Settings → General settings**.
4. In the credential form, paste the **CMA Token**, set the **Space ID**, and choose the **API Base URL** (use the EU host for EU-region spaces).

::: warning CMA tokens are powerful
A personal CMA token can read and write everything your user can across your spaces. Treat it as a full-access secret and revoke it if exposed.
:::

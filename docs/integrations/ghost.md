# Ghost

Lets agents read published **posts, pages, tags, and authors** from a Ghost site through its Content API. Authenticates with a Content API key, sent as a `key` query parameter.

[Ghost Content API documentation](https://docs.ghost.org/content-api)

## What you need

| Field           | Required | Notes                                                |
| --------------- | -------- | ---------------------------------------------------- |
| Content API Key | Yes      | Secret                                               |
| Site URL        | Yes      | Full base URL of your Ghost site, e.g. `https://example.com` (no trailing slash) |

## Getting your Content API key

1. In Ghost Admin, open **Settings → Integrations**.
2. Click **Add custom integration**, name it, and create it.
3. Copy the **Content API Key** into the credential form, and set your **Site URL**.

::: tip Content API is read-only
This integration uses Ghost's Content API, which reads published content. Publishing or editing requires the Admin API, which needs per-request signed tokens and is not supported here.
:::

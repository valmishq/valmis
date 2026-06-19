# ActiveCampaign

Lets agents manage **contacts, deals, lists, and automations** in ActiveCampaign. Authenticates with your API key, sent in the `Api-Token` header. Because the API host is account-specific, you also supply your account's API base URL.

[ActiveCampaign API authentication documentation](https://developers.activecampaign.com/reference/authentication)

## What you need

| Field        | Required | Notes                                                                       |
| ------------ | -------- | --------------------------------------------------------------------------- |
| API Key      | Yes      | Secret                                                                      |
| API Base URL | Yes      | Your account API URL, e.g. `https://youraccount.api-us1.com` (no trailing slash, no `/api/3`) |

## Getting your API key

1. Sign in to ActiveCampaign and open **Settings → Developer**.
2. Copy both values shown there: the **API URL** and the **API Key**.
3. In the credential form, paste the **API Key** and set **API Base URL** to the API URL exactly as shown.

::: tip The region suffix varies
The host segment (`api-us1`, `api-us2`, …) differs per account, so copy the whole base URL from **Settings → Developer** rather than assuming `us1`.
:::

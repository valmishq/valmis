# Klaviyo

Lets agents manage **profiles, lists, events, and campaigns** in Klaviyo for ecommerce email and SMS marketing. Authenticates with a private API key using the `Klaviyo-API-Key` scheme, alongside a required dated `revision` header.

[Klaviyo API authentication documentation](https://developers.klaviyo.com/en/docs/authenticate_)

## What you need

| Field           | Required | Notes                                |
| --------------- | -------- | ------------------------------------ |
| Private API Key | Yes      | Secret — starts with `pk_`           |

## Getting your API key

1. Sign in to Klaviyo and open **Settings → Account → API keys**, or go to [klaviyo.com/settings/account/api-keys](https://www.klaviyo.com/settings/account/api-keys).
2. Under **Private API Keys**, click **Create Private API Key**, name it, and grant the scopes the agent needs — include **accounts:read** so the connection test can verify the key.
3. Copy the key (starts with `pk_`) into the credential form — it is shown only once.

::: tip API version is pinned for you
Klaviyo requires a dated `revision` header on every request. The credential sets a current revision automatically, so you only need to supply the key.
:::

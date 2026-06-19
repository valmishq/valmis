# Paddle

Lets agents work with the Paddle Billing API — **products, prices, customers, subscriptions, and transactions**. Authenticates with an API key sent as a Bearer token.

[Paddle API documentation](https://developer.paddle.com/api-reference/about/authentication)

## What you need

| Field        | Required | Notes                                                                            |
| ------------ | -------- | -------------------------------------------------------------------------------- |
| API Key      | Yes      | Secret — starts with `pdl_live_apikey_...` or `pdl_sdbx_apikey_...`               |
| API Base URL | Yes      | Production `https://api.paddle.com` or sandbox `https://sandbox-api.paddle.com`   |

## Getting your API key

1. Sign in to Paddle and open **Paddle > Developer tools > Authentication**.
2. Click **Generate API key**, name it, and grant the permissions the agent needs (read and/or write).
3. Copy the key (`pdl_live_apikey_...` or `pdl_sdbx_apikey_...`) into the credential form — it is shown only once.
4. Set **API Base URL** to match the key's environment.

::: warning Keys are environment-specific
A sandbox key (`pdl_sdbx_...`) only works against `sandbox-api.paddle.com`, and a live key (`pdl_live_...`) only against `api.paddle.com`. Build against sandbox first.
:::

::: tip API version is pinned for you
The credential sends the `Paddle-Version` header automatically, so the API behaviour stays stable as Paddle ships changes — you only supply the key.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List our active subscription plans and their prices."
- "How many transactions completed this month, and what's the total?"
- "Find the customer with email jane@example.com and show their subscriptions."

# Lemon Squeezy

Lets agents work with your Lemon Squeezy store — **stores, products, orders, subscriptions, customers, and license keys**. Authenticates with an API key sent as a Bearer token.

[Lemon Squeezy API documentation](https://docs.lemonsqueezy.com/api)

## What you need

| Field   | Required | Notes                            |
| ------- | -------- | -------------------------------- |
| API Key | Yes      | Secret — valid for one year      |

## Getting your API key

1. Sign in to Lemon Squeezy and open **Settings → API**.
2. Click **+** to create a new API key, name it, and copy the value into the credential form — it is shown only once.

::: tip JSON:API headers are handled for you
The Lemon Squeezy API requires a special `Accept: application/vnd.api+json` header on every request. The credential sets it automatically, so you only supply the key.
:::

::: info Keys expire after a year
API keys are valid for one year. When a key approaches expiry, generate a new one and update the credential.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "How many active subscriptions do we have, and what's the monthly recurring total?"
- "List orders from the last 7 days with their amounts and customer emails."
- "Find the license key for order #1234 and tell me if it's still active."

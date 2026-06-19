# Postmark

Lets agents send **transactional email** and read delivery statistics in Postmark. Authenticates with a Server API Token, sent in the `X-Postmark-Server-Token` header.

[Postmark API documentation](https://postmarkapp.com/developer/api/overview)

## What you need

| Field            | Required | Notes  |
| ---------------- | -------- | ------ |
| Server API Token | Yes      | Secret |

## Getting your server token

1. Sign in to Postmark and open the **Server** you want the agent to use.
2. Go to the server's **API Tokens** tab.
3. Copy the **Server API Token** into the credential form.

::: tip Server token vs account token
The Server API Token scopes the credential to one server (sending, stats). Postmark's separate Account API Token (which manages servers and signatures) is not used by this integration.
:::

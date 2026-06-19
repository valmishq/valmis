# Productboard

Lets agents work with **Productboard** — **features, notes, components, and releases**. Authenticates with an access token sent as a Bearer token alongside a required `X-Version` header.

[Productboard API documentation](https://developer.productboard.com/reference/authentication)

## What you need

| Field        | Required | Notes  |
| ------------ | -------- | ------ |
| Access Token | Yes      | Secret |

## Getting your token

1. Sign in to Productboard and open **Workspace Settings → Integrations → Public API**.
2. Click **+** to generate an access token, name it, and copy the value into the credential form — it is shown only once.

::: tip API version header is handled for you
Productboard requires an `X-Version` header on every request. The credential sends it automatically, so you only supply the token.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List our top features by user-impact score."
- "Create a note titled 'Customer asked for SSO' with the feedback I paste."
- "What releases are scheduled in the next quarter?"

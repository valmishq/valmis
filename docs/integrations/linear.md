# Linear

Lets agents manage **issues, projects, cycles, and teams** in Linear through its GraphQL API. Authenticates with a personal API key, sent raw in the `Authorization` header.

[Linear API documentation](https://linear.app/developers/graphql)

## What you need

| Field            | Required | Notes  |
| ---------------- | -------- | ------ |
| Personal API Key | Yes      | Secret |

## Getting your API key

1. Sign in to Linear and open **Settings → Account → Security & access**, or go to [linear.app/settings/account/security](https://linear.app/settings/account/security).
2. Under **Personal API keys**, click **New API key**, name it, and choose its access level.
3. Copy the key into the credential form — it is shown only once.

::: warning Sent without a `Bearer` prefix
Linear expects the raw key in the `Authorization` header (no `Bearer`); the `Bearer` scheme is only for OAuth tokens. The credential handles this — paste only the key.
:::

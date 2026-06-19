# Coda

Lets agents read and write **docs, tables, rows, and controls** in Coda. Authenticates with a personal API token, sent as a Bearer token.

[Coda API documentation](https://coda.io/developers)

## What you need

| Field     | Required | Notes  |
| --------- | -------- | ------ |
| API Token | Yes      | Secret |

## Getting your API token

1. Sign in to Coda and open **Account Settings → API settings**, or go to [coda.io/account](https://coda.io/account).
2. Click **Generate API token**, name it, and (optionally) restrict it to specific docs or workspaces.
3. Copy the token into the credential form — it is shown only once.

::: tip Scope the token
Coda tokens can be restricted to specific docs or workspaces and to read-only access. Grant only what the agent needs.
:::

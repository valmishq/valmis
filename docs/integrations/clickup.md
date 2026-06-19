# ClickUp

Lets agents manage **tasks, lists, folders, and spaces** in ClickUp. Authenticates with a personal API token, sent raw in the `Authorization` header.

[ClickUp API authentication documentation](https://developer.clickup.com/docs/authentication)

## What you need

| Field              | Required | Notes                      |
| ------------------ | -------- | -------------------------- |
| Personal API Token | Yes      | Secret — starts with `pk_` |

## Getting your API token

1. Sign in to ClickUp and open **Settings → Apps**, or go to [app.clickup.com/settings/apps](https://app.clickup.com/settings/apps).
2. Under **API Token**, click **Generate** (or copy the existing one).
3. Paste the token (starts with `pk_`) into the credential form.

::: warning Sent without a `Bearer` prefix
ClickUp expects the raw token in the `Authorization` header (no `Bearer`). A personal token grants the same access as your user across all your workspaces.
:::

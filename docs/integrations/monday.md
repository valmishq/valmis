# monday.com

Lets agents manage **boards, items, columns, and updates** in monday.com through its GraphQL API. Authenticates with a personal API token, sent raw in the `Authorization` header.

[monday.com API authentication documentation](https://developer.monday.com/api-reference/docs/authentication)

## What you need

| Field     | Required | Notes  |
| --------- | -------- | ------ |
| API Token | Yes      | Secret |

## Getting your API token

1. Sign in to monday.com and open your **avatar → Developers → My access tokens**, or (as an admin) **Administration → Connections → Personal API token**.
2. Click **Show** and copy your personal **API token** into the credential form.

::: warning Sent without a `Bearer` prefix
monday.com expects the raw token in the `Authorization` header (no `Bearer`). The credential handles this — paste only the token. Regenerating the token immediately invalidates the old one.
:::

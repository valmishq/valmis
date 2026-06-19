# Pipedrive

Lets agents manage **deals, persons, organizations, and activities** in the Pipedrive CRM. Authenticates with a personal API token, sent in the `x-api-token` header.

[Pipedrive API authentication documentation](https://pipedrive.readme.io/docs/core-api-concepts-authentication)

## What you need

| Field     | Required | Notes  |
| --------- | -------- | ------ |
| API Token | Yes      | Secret |

## Getting your API token

1. Sign in to Pipedrive and open your account name (top right) → **Company settings → Personal preferences → API**, or go directly to [app.pipedrive.com/settings/api](https://app.pipedrive.com/settings/api).
2. Copy your **personal API token** into the credential form.

::: warning One token per user + company
A Pipedrive token is tied to a single user in a single company, and only one is active at a time. Regenerating it invalidates the previous token and any agent still using it.
:::

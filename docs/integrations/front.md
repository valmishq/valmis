# Front

Lets agents work with **conversations, messages, contacts, and comments** in Front, the shared inbox platform. Authenticates with an API token, sent as a Bearer token.

[Front API authentication documentation](https://dev.frontapp.com/docs/authentication)

## What you need

| Field     | Required | Notes  |
| --------- | -------- | ------ |
| API Token | Yes      | Secret |

## Getting your API token

1. In Front, open **Settings → Developers → API Tokens**.
2. Click **Create API token**, name it, and select the scopes the agent needs (read/write/send per resource).
3. Copy the token into the credential form — it is shown only once.

::: tip Scope to the task
Front tokens carry granular scopes per resource and namespace. Grant only the scopes the agent needs (for example, read conversations and send replies) rather than full access.
:::

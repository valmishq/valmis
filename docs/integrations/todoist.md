# Todoist

Lets agents manage **projects, tasks, sections, and labels** in Todoist. Authenticates with a personal API token, sent as a Bearer token.

[Todoist API documentation](https://developer.todoist.com/api/v1/)

## What you need

| Field     | Required | Notes  |
| --------- | -------- | ------ |
| API Token | Yes      | Secret |

## Getting your API token

1. Open Todoist (web or desktop) and go to **Settings → Integrations → Developer**.
2. Copy your **API token** into the credential form.

::: tip Personal scope
The Todoist API token grants access to your own account's projects and tasks. There is no separate scoping — keep it private and revoke it from the same page if needed.
:::

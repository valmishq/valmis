# Toggl Track

Lets agents manage **time entries, projects, clients, and workspaces** in Toggl Track. Authenticates with your API token, sent as HTTP Basic Auth.

[Toggl Track API authentication documentation](https://engineering.toggl.com/docs/authentication/)

## What you need

| Field                | Required | Notes                                                          |
| -------------------- | -------- | -------------------------------------------------------------- |
| API Token            | Yes      | Secret — used as the Basic Auth username                       |
| Password Placeholder | Yes      | Leave as the default `api_token`                               |

## Getting your API token

1. Sign in to Toggl Track and open your **Profile settings**.
2. Scroll to the bottom and copy your **API Token**.
3. In the credential form, paste it into **API Token** and leave **Password Placeholder** as `api_token`.

::: tip Why the placeholder password
Toggl Track's Basic Auth uses your API token as the username and the literal string `api_token` as the password. The credential keeps that constant so you never have to type it.
:::

# Freshdesk

Lets agents manage support **tickets, contacts, and agents** in Freshdesk. Authenticates with your API key, sent as HTTP Basic Auth on every request.

[Freshdesk API documentation](https://developers.freshdesk.com/api/)

## What you need

| Field                | Required | Notes                                                       |
| -------------------- | -------- | ----------------------------------------------------------- |
| API Key              | Yes      | Secret — used as the Basic Auth username                    |
| Password Placeholder | Yes      | Leave as the default `X` — Freshdesk ignores the password   |
| Domain               | Yes      | The `xxx` in `https://xxx.freshdesk.com`                    |

## Getting your API key

1. Sign in to your Freshdesk portal and open your **Profile Settings** (click your avatar → Profile settings).
2. Find **Your API Key** below the change-password section and copy it.
3. In the credential form, paste it into **API Key**, leave **Password Placeholder** as `X`, and set your **Domain**.

::: tip Why the placeholder password
Freshdesk's Basic Auth uses the API key as the username and any non-empty string as the password. The credential keeps that string as `X` so you never have to type it.
:::

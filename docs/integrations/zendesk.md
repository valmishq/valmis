# Zendesk

Lets agents manage support **tickets, users, and organizations** in Zendesk Support. Authenticates with your agent email and an API token, sent as HTTP Basic Auth on every request.

[Zendesk API authentication documentation](https://developer.zendesk.com/api-reference/introduction/security-and-auth/)

## What you need

| Field      | Required | Notes                                                                            |
| ---------- | -------- | -------------------------------------------------------------------------------- |
| Email/token | Yes     | Your agent email followed by the literal `/token` suffix, e.g. `you@example.com/token` |
| API Token  | Yes      | Secret                                                                           |
| Subdomain  | Yes      | The `xxx` in `https://xxx.zendesk.com`                                            |

## Getting your API token

1. As an admin, open **Admin Center → Apps and integrations → APIs → Zendesk API**.
2. Enable **Token access** if it is off, then click **Add API token**.
3. Optionally name the token, then copy it — it is shown only once.
4. In the credential form, enter your **Email/token** as `your-agent-email@example.com/token` (keep the literal `/token` suffix), paste the **API Token**, and set your **Subdomain**.

::: warning The `/token` suffix is required
Zendesk's token auth expects the username to be `email/token`, not just your email. Leaving off `/token` causes a 401. The API token itself goes in the API Token field.
:::

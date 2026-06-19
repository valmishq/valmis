# Resend

Lets agents send **transactional email** and manage domains and audiences in Resend. Authenticates with an API key, sent as a Bearer token.

[Resend API documentation](https://resend.com/docs/api-reference/introduction)

## What you need

| Field   | Required | Notes                      |
| ------- | -------- | -------------------------- |
| API Key | Yes      | Secret — starts with `re_` |

## Getting your API key

1. Sign in to Resend and open [resend.com/api-keys](https://resend.com/api-keys).
2. Click **Create API Key**, name it, and choose **Full access** or **Sending access**.
3. Copy the key (starts with `re_`) into the credential form — it is shown only once.

::: tip Verify a sending domain first
To send from your own address, add and verify a domain under **Domains** in the Resend dashboard before having the agent send mail.
:::

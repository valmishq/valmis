# SendGrid

Lets agents send **transactional and marketing email** and manage templates, contacts, and statistics in Twilio SendGrid. Authenticates with an API key, sent as a Bearer token.

[SendGrid API authentication documentation](https://www.twilio.com/docs/sendgrid/api-reference/how-to-use-the-sendgrid-v3-api/authentication)

## What you need

| Field        | Required | Notes                                                                |
| ------------ | -------- | -------------------------------------------------------------------- |
| API Key      | Yes      | Secret — starts with `SG.`                                           |
| API Base URL | Yes      | Global `https://api.sendgrid.com`, or EU `https://api.eu.sendgrid.com` |

## Getting your API key

1. Sign in to SendGrid and open **Settings → API Keys**.
2. Click **Create API Key**, name it, and choose **Full Access** or **Restricted Access** with the permissions the agent needs (for example, *Mail Send*).
3. Copy the key into the credential form — it is shown only once.
4. Set **API Base URL** to the EU host only if your account uses EU data residency; otherwise keep the default.

::: tip Restrict the key
SendGrid supports restricted-access keys scoped to specific permissions. A key limited to *Mail Send* is much safer to hand to an agent than a full-access key.
:::

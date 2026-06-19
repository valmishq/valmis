# Brevo

Lets agents send **transactional and marketing email and SMS** and manage contacts in Brevo (formerly Sendinblue). Authenticates with an API key, sent in the `api-key` header.

[Brevo API key authentication documentation](https://developers.brevo.com/docs/api-key-authentication)

## What you need

| Field   | Required | Notes  |
| ------- | -------- | ------ |
| API Key | Yes      | Secret |

## Getting your API key

1. Sign in to Brevo and open **SMTP & API settings → API keys**, or go to [app.brevo.com/settings/keys/api](https://app.brevo.com/settings/keys/api).
2. Click **Generate a new API key**, name it, and copy it — it is shown only once.
3. Paste the key into the credential form.

::: tip Note: not a Bearer token
Brevo sends the key in a custom `api-key` header, not `Authorization: Bearer`. The credential handles this for you — just paste the raw key.
:::

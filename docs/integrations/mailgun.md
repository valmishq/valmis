# Mailgun

Lets agents send **transactional email** and manage domains and mailing lists in Mailgun. Authenticates with your private API key, sent as HTTP Basic Auth (username `api`).

[Mailgun API authentication documentation](https://documentation.mailgun.com/docs/mailgun/api-reference/mg-auth)

## What you need

| Field        | Required | Notes                                                            |
| ------------ | -------- | ---------------------------------------------------------------- |
| Username     | Yes      | Leave as the default `api`                                       |
| API Key      | Yes      | Secret — your private API key                                    |
| API Base URL | Yes      | US `https://api.mailgun.net`, or EU `https://api.eu.mailgun.net` |

## Getting your API key

1. Sign in to the Mailgun dashboard and open **Account Settings → API Keys**.
2. Copy your **private API key**.
3. In the credential form, paste it into **API Key**, leave **Username** as `api`, and choose the **API Base URL** that matches your account region (US or EU).

::: warning US vs EU regions
Mailgun domains are region-bound. If your domain was created in the EU region, you must use `https://api.eu.mailgun.net` or requests will fail.
:::

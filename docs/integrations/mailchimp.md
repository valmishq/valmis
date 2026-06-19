# Mailchimp

Lets agents manage **audiences, campaigns, and subscribers** in Mailchimp. Authenticates with an API key, sent as HTTP Basic Auth. The API host includes a datacenter prefix derived from the end of your key.

[Mailchimp Marketing API documentation](https://mailchimp.com/developer/marketing/docs/fundamentals/)

## What you need

| Field      | Required | Notes                                                                        |
| ---------- | -------- | ---------------------------------------------------------------------------- |
| Username   | Yes      | Leave as the default — Mailchimp ignores the username                         |
| API Key    | Yes      | Secret                                                                       |
| Datacenter | Yes      | The part after the final dash in your key, e.g. a key ending in `-us6` → `us6` |

## Getting your API key

1. Sign in to Mailchimp and open **Account & billing → Extras → API keys**.
2. Click **Create New Key** and copy it immediately.
3. Read the datacenter from the **end of the key**: everything after the last dash. For a key ending in `-us19`, the **Datacenter** is `us19`.
4. In the credential form, paste the **API Key**, set the **Datacenter**, and leave **Username** as the default.

::: tip Find the datacenter from your dashboard URL too
The datacenter also appears as the subdomain when you are logged in, e.g. `https://us19.admin.mailchimp.com` → `us19`.
:::

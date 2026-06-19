# Customer.io

Lets agents work with **Customer.io** via the App API — **look up people, manage campaigns and segments, and send transactional or broadcast messages**. Authenticates with an App API key sent as a Bearer token.

[Customer.io App API documentation](https://docs.customer.io/integrations/api/app/)

## What you need

| Field        | Required | Notes                                                            |
| ------------ | -------- | ---------------------------------------------------------------- |
| App API Key  | Yes      | Secret                                                           |
| API Base URL | Yes      | US `https://api.customer.io` or EU `https://api-eu.customer.io`  |

## Getting your key

1. Sign in to Customer.io and open **Settings → Account Settings → API Credentials**.
2. Go to the **App API Keys** tab, create a key, name it, and copy it into the credential form.
3. Set **API Base URL** to match your workspace region (US or EU).

::: tip App API vs Track API
This integration uses the **App API** (read and manage campaigns, segments, people, and send messages). Customer.io's separate **Track API** (for high-volume event/person ingestion) uses different credentials and isn't covered here.
:::

::: warning Region matters
A US workspace key won't work against the EU host and vice-versa. If requests fail with auth errors, confirm **API Base URL** matches your workspace's region.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List our active campaigns and what each one targets."
- "How many people are in the 'Trial users' segment?"
- "Send the 'welcome' transactional message to customer id 42."

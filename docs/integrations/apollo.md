# Apollo.io

Lets agents use **Apollo.io** sales intelligence — **search people and companies, enrich contacts, and manage sequences**. Authenticates with an API key sent in the `X-Api-Key` header.

[Apollo.io API authentication documentation](https://docs.apollo.io/reference/authentication)

## What you need

| Field   | Required | Notes  |
| ------- | -------- | ------ |
| API Key | Yes      | Secret |

## Getting your API key

1. Sign in to Apollo and open **Settings → Integrations → API**.
2. Click **Connect** / **API Keys**, create a key, and copy it into the credential form.

::: tip Header auth only
Apollo deprecated passing the key in the query string or request body in 2024. The credential sends it in the `X-Api-Key` header, which is the current supported method.
:::

::: info API access is a paid feature
Apollo's API is available on its paid plans, and most endpoints consume credits. Check your plan's API access and credit limits before pointing an agent at it.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "Find the email and title for the person at acme.com whose name is Jane Doe."
- "Search for VPs of Engineering at SaaS companies with 50–200 employees."
- "Enrich this list of company domains with industry and headcount."

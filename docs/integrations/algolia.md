# Algolia

Lets agents manage **Algolia** search — **indices, records, and search settings**. Authenticates with your Application ID and an API key, sent as the `X-Algolia-Application-Id` and `X-Algolia-API-Key` headers.

[Algolia REST API documentation](https://www.algolia.com/doc/rest-api/search/)

## What you need

| Field          | Required | Notes                                                        |
| -------------- | -------- | ------------------------------------------------------------ |
| Application ID | Yes      | From **Settings → API Keys**, e.g. `LATENCY1234`             |
| Admin API Key  | Yes      | Secret — an Admin key, or a key with the `listIndexes` ACL   |

## Getting your keys

1. Sign in to the [Algolia dashboard](https://dashboard.algolia.com/) and open **Settings → API Keys**.
2. Copy the **Application ID** into the credential form.
3. Copy the **Admin API Key** (or create a scoped key that includes the `listIndexes` ACL plus whatever the agent needs) into the credential form.

::: warning The Admin key is powerful
An Admin API key can read, write, and delete every index in the application. If the agent only needs to search or update specific indices, create a [restricted API key](https://www.algolia.com/doc/guides/security/api-keys/#scoping-an-api-key) with just those ACLs and indices instead.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List all the indices in this application and their record counts."
- "Search the `products` index for 'wireless headphones' and show the top 5 hits."
- "Add a record to the `faq` index with the question and answer I give you."

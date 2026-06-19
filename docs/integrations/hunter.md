# Hunter.io

Lets agents use **Hunter.io** to **find and verify professional email addresses and look up domains**. Authenticates with an API key sent as an `api_key` query parameter.

[Hunter.io API documentation](https://hunter.io/api-documentation/v2)

## What you need

| Field   | Required | Notes  |
| ------- | -------- | ------ |
| API Key | Yes      | Secret |

## Getting your API key

1. Sign in to Hunter and open the [API keys page](https://hunter.io/api-keys).
2. Copy your API key into the credential form.

::: info Requests count against your plan
Domain Search, Email Finder, and Email Verifier each consume from your monthly request quota. The connection test uses the free **Account** endpoint, which does not count against it.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "Find the most likely email address for John Smith at example.com."
- "Verify whether jane@acme.com is deliverable."
- "List the public email addresses Hunter has for the domain stripe.com."

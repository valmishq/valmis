# Chargebee

Lets agents work with your Chargebee billing — **subscriptions, customers, invoices, and plans**. Authenticates with an API key sent as HTTP Basic Auth (the key is the username, with a blank password).

[Chargebee API authentication documentation](https://apidocs.chargebee.com/docs/api/auth)

## What you need

| Field   | Required | Notes                                                                 |
| ------- | -------- | --------------------------------------------------------------------- |
| API Key | Yes      | Secret — sent as the Basic Auth username                              |
| Site    | Yes      | Your site name — the `xxx` in `https://xxx.chargebee.com`             |

## Getting your API key

1. Sign in to Chargebee and open **Settings → Configure Chargebee → API Keys**.
2. Click **Create a Key**, choose a **Full-Access** or **Read-Only** key as appropriate, and copy the value into the credential form — it is shown only once.
3. Enter your **Site** name (the subdomain in your Chargebee URL).

::: tip No password needed
Chargebee's Basic Auth uses the API key as the username and an **empty** password. The credential handles this for you — there is no password field to fill in.
:::

::: info Test vs live sites
Chargebee test sites are usually named `{site}-test` and have their own API keys. Store the test site as its own credential while building an agent.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "How many active subscriptions are on the 'Pro Annual' plan?"
- "List invoices that are overdue and their outstanding amounts."
- "Find the customer with email finance@acme.com and summarize their subscription."

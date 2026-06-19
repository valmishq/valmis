# Gorgias

Lets agents work with **Gorgias**, the e-commerce helpdesk — **tickets, customers, and messages**. Authenticates with your account email and an API key sent as HTTP Basic Auth.

[Gorgias API authentication documentation](https://developers.gorgias.com/reference/authentication)

## What you need

| Field         | Required | Notes                                            |
| ------------- | -------- | ------------------------------------------------ |
| Account Email | Yes      | Your Gorgias login email (the Basic Auth username) |
| API Key       | Yes      | Secret                                           |
| Subdomain     | Yes      | The `xxx` in `https://xxx.gorgias.com`           |

## Getting your API key

1. Sign in to Gorgias and open **Settings → REST API** (under Integrations).
2. Generate an API key and copy it into the credential form.
3. Enter the **Account Email** you sign in with, and your **Subdomain**.

::: tip Use a dedicated account
The API key acts as the user it belongs to. Consider creating a dedicated Gorgias user for the agent with a role scoped to what it should do.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "How many open tickets are in the queue right now?"
- "Find the most recent ticket from customer jane@example.com and summarize it."
- "Add an internal note to ticket #4821 saying the refund was processed."

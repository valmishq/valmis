# Mollie

Lets agents work with Mollie — **payments, refunds, customers, and subscriptions**. Authenticates with an API key sent as a Bearer token.

[Mollie API authentication documentation](https://docs.mollie.com/reference/authentication)

## What you need

| Field   | Required | Notes                                            |
| ------- | -------- | ------------------------------------------------ |
| API Key | Yes      | Secret — starts with `test_...` or `live_...`    |

## Getting your API key

1. Sign in to the [Mollie Dashboard](https://www.mollie.com/dashboard) and open **Developers → API keys**.
2. Copy the **Test API key** (`test_...`) or **Live API key** (`live_...`) into the credential form.

::: warning Test vs live
The `test_` / `live_` prefix selects the mode against the same `api.mollie.com` host — a live key processes real payments. Start with the test key while building an agent.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List payments created today and whether each one is paid."
- "Create a €25 payment link for invoice INV-042 and give me the checkout URL."
- "Refund payment tr_XXXXXXXX in full."

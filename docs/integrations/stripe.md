# Stripe

Lets agents use the Stripe API — customers, payments, invoices, subscriptions. Authenticates with a Secret Key sent as a Bearer token.

[Stripe API documentation](https://docs.stripe.com/api)

## What you need

| Field                  | Required | Notes                                                                                  |
| ---------------------- | -------- | -------------------------------------------------------------------------------------- |
| Secret Key             | Yes      | Secret — `sk_live_...` (live) or `sk_test_...` (test). Never a publishable `pk_*` key. |
| Webhook Signing Secret | No       | Secret — only needed if you process Stripe webhook events                              |

## Getting your keys

**Secret key:**

1. Open the Stripe Dashboard's API keys page — [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) for live mode or [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys) for test mode.
2. Reveal and copy the **Secret key** into the credential form.

**Webhook signing secret (optional):**

1. Go to **Developers → Webhooks** and select your endpoint.
2. Copy the **Signing secret** into the credential form.

::: tip One credential per mode
Live and test mode are separate environments. Store each mode's key as its own credential (e.g. "Stripe (test)", "Stripe (live)") and attach the test credential while developing an agent.
:::

::: warning Live keys move real money
An agent holding a live secret key can create charges and refunds. Start with a test key, and consider Stripe [restricted keys](https://docs.stripe.com/keys#create-restricted-api-secret-key) to limit what the credential can do.
:::

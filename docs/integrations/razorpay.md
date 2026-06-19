# Razorpay

Lets agents work with Razorpay — **payments, orders, refunds, and settlements**. Authenticates with a Key ID and Key Secret sent as HTTP Basic Auth.

[Razorpay API authentication documentation](https://razorpay.com/docs/api/authentication/)

## What you need

| Field      | Required | Notes                                              |
| ---------- | -------- | -------------------------------------------------- |
| Key ID     | Yes      | Starts with `rzp_live_...` (live) or `rzp_test_...` (test) |
| Key Secret | Yes      | Secret — shown only once when the key is generated |

## Getting your keys

1. Sign in to the [Razorpay Dashboard](https://dashboard.razorpay.com/) and open **Settings → API Keys**.
2. Switch to **Test Mode** or **Live Mode** (top of the dashboard) depending on which key you want.
3. Click **Generate Key**, then copy the **Key ID** and **Key Secret** into the credential form — the secret is shown only once.

::: warning Test vs live keys
The `rzp_test_` / `rzp_live_` prefix decides whether the agent touches test or real money against the same `api.razorpay.com` host. Build with a test key first, and store live and test keys as separate credentials.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List payments captured in the last 24 hours and their amounts."
- "Find payment pay_XXXXXXXX and tell me its status and the customer's email."
- "Has order order_XXXXXXXX been paid?"

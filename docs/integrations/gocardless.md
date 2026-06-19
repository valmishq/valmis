# GoCardless

Lets agents work with GoCardless bank-debit billing — **customers, mandates, payments, and payouts**. Authenticates with an access token sent as a Bearer token.

[GoCardless API documentation](https://developer.gocardless.com/api-reference/)

## What you need

| Field        | Required | Notes                                                                      |
| ------------ | -------- | -------------------------------------------------------------------------- |
| Access Token | Yes      | Secret — environment-specific (live or sandbox)                            |
| API Base URL | Yes      | Live `https://api.gocardless.com` or sandbox `https://api-sandbox.gocardless.com` |

## Getting your access token

1. Sign in to the [GoCardless dashboard](https://manage.gocardless.com/) (or the [sandbox dashboard](https://manage-sandbox.gocardless.com/)).
2. Open **Developers → Create → Access token**, give it a name, choose **Read-only** or **Read-write**, and create it.
3. Copy the token into the credential form — it is shown only once.
4. Set **API Base URL** to match the dashboard you created the token in.

::: warning Match the environment
A sandbox token only works against `api-sandbox.gocardless.com`, and a live token only against `api.gocardless.com`. Build against sandbox first.
:::

::: tip API version is pinned for you
GoCardless requires a dated `GoCardless-Version` header on every request. The credential sends a stable version automatically, so you only supply the token.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List active mandates and the customers they belong to."
- "How much is scheduled to be paid out this week?"
- "Create a £40 payment against mandate MD0XXXXX."

# Cloudflare

Lets agents manage DNS records, zones, Workers, R2, Pages, and other Cloudflare services. Authenticates with an API Token sent as a Bearer token.

[Cloudflare API documentation](https://developers.cloudflare.com/api/)

## What you need

| Field     | Required | Notes                                                   |
| --------- | -------- | ------------------------------------------------------- |
| API Token | Yes      | Secret — use a scoped API Token, not the Global API Key |

## Getting your API token

1. Open [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens).
2. Click **Create Token** — start from a template (e.g. _Edit zone DNS_) or build a custom token.
3. Grant **only the permissions your use case requires**, and restrict it to specific zones/accounts where possible.
4. Create the token and copy it into the credential form.

::: tip Prefer scoped tokens
API Tokens support fine-grained permissions and are preferred over the account-wide Global API Key — especially for credentials handed to an agent.
:::

# BigCommerce

Lets agents manage a BigCommerce store through its V3 REST API — **products, orders, customers, and catalog**. Authenticates with a store API account token sent in the `X-Auth-Token` header.

[BigCommerce authentication documentation](https://developer.bigcommerce.com/docs/start/authentication)

## What you need

| Field        | Required | Notes                                                                      |
| ------------ | -------- | -------------------------------------------------------------------------- |
| Access Token | Yes      | Secret — the API account token                                             |
| Store Hash   | Yes      | The `xxxxxx` in `https://api.bigcommerce.com/stores/xxxxxx/`               |

## Getting your token

1. In the BigCommerce control panel, open **Settings → API → Store-level API accounts**.
2. Click **Create API account**, name it, and grant the **OAuth scopes** the agent needs (e.g. Products, Orders, Customers — read or modify).
3. Create the account and download the credentials. Copy the **Access Token** into the credential form.
4. The same file shows the **API Path** like `https://api.bigcommerce.com/stores/abc123/v3/`; copy the store hash (`abc123`) into **Store Hash**.

::: tip Scopes control what the agent can do
The token can only reach the scopes you granted the API account. If a request fails with a permission error, add the matching scope to the API account in BigCommerce.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "How many orders are awaiting fulfillment right now?"
- "List the 5 best-selling products this month."
- "Update the price of SKU TSHIRT-BLU-L to \$24.99."

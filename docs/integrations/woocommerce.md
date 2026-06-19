# WooCommerce

Lets agents manage a WooCommerce store through its REST API (v3) — **products, orders, customers, and coupons**. Authenticates with a consumer key and secret sent as HTTP Basic Auth over HTTPS.

[WooCommerce REST API documentation](https://woocommerce.github.io/woocommerce-rest-api-docs/)

## What you need

| Field           | Required | Notes                                                            |
| --------------- | -------- | ---------------------------------------------------------------- |
| Consumer Key    | Yes      | Secret — starts with `ck_...`                                    |
| Consumer Secret | Yes      | Secret — starts with `cs_...`                                    |
| Store URL       | Yes      | Your store's base URL, e.g. `https://shop.example.com` (HTTPS)   |

## Getting your keys

1. In WordPress admin, open **WooCommerce → Settings → Advanced → REST API**.
2. Click **Add key**, give it a description, pick a **User**, and set **Permissions** to **Read** or **Read/Write**.
3. Click **Generate API key**, then copy the **Consumer key** (`ck_...`) and **Consumer secret** (`cs_...`) into the credential form — they are shown only once.
4. Set **Store URL** to your store's base URL (no trailing slash).

::: warning HTTPS is required
WooCommerce only accepts the consumer key/secret as Basic Auth over **HTTPS**. On a plain-HTTP store the keys must travel as query parameters, which this integration does not use — serve your store over HTTPS.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List orders placed today with their status and total."
- "How many units of the product 'Blue T‑Shirt' are in stock?"
- "Create a 10% coupon code SPRING10 that expires at the end of the month."

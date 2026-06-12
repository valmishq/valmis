# Shopify

Lets agents work with a Shopify store through the Admin API — products, orders, customers, and more. Authenticates with a **custom app access token**, the recommended method for single-store integrations.

[Shopify access token documentation](https://shopify.dev/docs/apps/build/authentication-authorization/access-token-types/generate-app-access-tokens-admin)

## What you need

| Field          | Required | Notes                                                                                           |
| -------------- | -------- | ----------------------------------------------------------------------------------------------- |
| Shop Subdomain | Yes      | Only the subdomain from `https://<subdomain>.myshopify.com`, e.g. `my-store` — not the full URL |
| Access Token   | Yes      | Secret — the custom app's Admin API access token                                                |
| APP Secret Key | Yes      | Secret — the custom app's API secret key (used for webhook HMAC verification)                   |

## Creating the custom app and getting the credentials

1. In your Shopify admin, go to **Settings → Apps and sales channels → Develop apps** (enable custom app development if prompted).
2. Click **Create an app** and name it (e.g. "Agent-Int").
3. On the **Configuration** tab, set the **Admin API scopes** the agent needs (e.g. `read_orders`, `write_products`).
4. **Install the app** on the store.
5. On the **API credentials** tab:
   - Copy the **Admin API access token** (revealed only once) → the credential's _Access Token_ field
   - Copy the **API secret key** → the credential's _APP Secret Key_ field
6. Enter your store's subdomain and save.

::: warning Token shown once
Shopify reveals the Admin API access token a single time after installing the app. If you lose it, uninstall and reinstall the app to rotate the token.
:::

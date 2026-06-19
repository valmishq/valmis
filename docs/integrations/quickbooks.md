# QuickBooks Online

Lets agents work with your QuickBooks Online accounting data — **invoices, customers, vendors, payments, accounts, and reports**. Authenticates via OAuth2 (Intuit), with the access token sent as a Bearer token.

[QuickBooks Online API documentation](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)

## What you need

| Field             | Required | Notes                                                                                   |
| ----------------- | -------- | --------------------------------------------------------------------------------------- |
| Client ID         | Yes      | From your Intuit app's **Keys & credentials**                                           |
| Client Secret     | Yes      | Secret — same Keys & credentials page                                                    |
| Company ID (realmId) | Yes   | The company you connect to, e.g. `4620816365212942600`. Returned on the OAuth redirect   |
| API Base URL      | Yes      | Production `https://quickbooks.api.intuit.com` or sandbox `https://sandbox-quickbooks.api.intuit.com` |

## Setting up the app

1. Sign in at [developer.intuit.com](https://developer.intuit.com/) and create an app under **My Apps** (choose the **Accounting** scope).
2. Open the app's **Keys & credentials** and copy the **Client ID** and **Client Secret** into the credential form.
3. On the same page, add the redirect URI shown on the credential form: `<APP_URL>/oauth2/callback`.
4. Set **API Base URL** to production or sandbox to match the company you'll connect to.
5. Find your **Company ID (realmId)** — it appears in the URL after you authorize, and under **API Docs & tools → your app** in the developer portal. Paste it into the credential form.
6. Save the credential, click **Authorize**, and grant access to your QuickBooks company.

::: tip The Company ID is part of every request
QuickBooks scopes all data to a company, so the **realmId** is required and goes into each API path (`/v3/company/<realmId>/...`). If calls return "company not found", confirm the realmId matches the authorized company and the base URL matches its environment.
:::

::: warning Match the environment
A production app/token only works against `quickbooks.api.intuit.com`, and a sandbox app/token only against `sandbox-quickbooks.api.intuit.com`. Build against a sandbox company first.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "Create a draft invoice for Acme Corp for 10 hours of consulting at \$150/hour."
- "List all unpaid invoices over \$1,000 and their due dates."
- "What was our total income last month according to the Profit and Loss report?"

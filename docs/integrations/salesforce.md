# Salesforce

Lets agents work with your **Salesforce** org — **leads, contacts, accounts, opportunities, and custom objects**. Authenticates via OAuth2 (web server flow), with the access token sent as a Bearer token.

[Salesforce OAuth2 web server flow documentation](https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_web_server_flow.htm&type=5)

## What you need

| Field           | Required | Notes                                  |
| --------------- | -------- | -------------------------------------- |
| Consumer Key    | Yes      | From your Connected App                 |
| Consumer Secret | Yes      | Secret — from your Connected App        |

## Setting up the Connected App

1. In Salesforce Setup, open **App Manager → New Connected App** and enable **OAuth Settings**.
2. Set the **Callback URL** to the redirect URI shown on the credential form: `<APP_URL>/oauth2/callback`.
3. Add the OAuth scopes: **Manage user data via APIs (api)**, **Perform requests at any time (refresh_token, offline_access)**, and **Open ID Connect (openid)**.
4. Save, then open **Manage Consumer Details** and copy the **Consumer Key** and **Consumer Secret** into the credential form.
5. Save the credential, click **Authorize**, and grant access to your Salesforce org.

::: tip Each org has its own API host
After authorizing, real API calls go to your org's `instance_url` (e.g. `https://yourcompany.my.salesforce.com`), which Salesforce returns with the token. The agent reads it automatically — the connection test uses the fixed identity endpoint to confirm the credential works.
:::

::: info Sandboxes
This integration authorizes against production (`login.salesforce.com`). To connect a Salesforce **sandbox**, you'd point the authorization at `test.salesforce.com` — ask if you need a sandbox variant.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "How many open opportunities are in the pipeline, and what's their total value?"
- "Create a lead for Jane Doe at Acme Corp with email jane@acme.com."
- "Find the contact 'John Smith' and show their account and recent activity."

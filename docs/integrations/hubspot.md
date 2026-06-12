# HubSpot

Lets agents work with your HubSpot CRM — contacts, companies, deals, lists, forms, and tickets. Two credential variants are available; the **service key** is recommended for most self-hosted setups.

## Option 1: Service Key (recommended)

**Credential type:** HubSpot (Service Key) — a private-app access token sent as a Bearer token. Scoped, and no OAuth2 setup required.

[HubSpot service keys documentation](https://developers.hubspot.com/docs/guides/apps/private-apps/service-keys-overview)

| Field                   | Required | Notes  |
| ----------------------- | -------- | ------ |
| App Token (Service Key) | Yes      | Secret |

### Getting the service key

1. In your HubSpot account, go to **Development → Keys → Service Keys**.
2. Create a key and select the scopes the agent needs (e.g. CRM object read/write scopes).
3. Copy the token value into the credential form.

## Option 2: OAuth2 (public app)

**Credential type:** HubSpot (OAuth2) — required when an integration acts on behalf of multiple HubSpot accounts.

[HubSpot public apps documentation](https://developers.hubspot.com/docs/guides/apps/public-apps/overview)

| Field         | Required | Notes                               |
| ------------- | -------- | ----------------------------------- |
| Client ID     | Yes      | From your public app's **Auth** tab |
| Client Secret | Yes      | Secret — same Auth tab              |

### Scopes must match exactly

Agent-Int requests this exact scope set during authorization:

```
oauth crm.objects.contacts.read crm.lists.read crm.objects.contacts.write
crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read
crm.objects.deals.write crm.schemas.contacts.read crm.schemas.companies.read
crm.schemas.deals.read crm.objects.owners.read crm.lists.write forms tickets
```

::: danger Configure these exact scopes in your HubSpot app
HubSpot rejects the authorization if the scopes requested don't match the scopes configured on the app. In your public app's **Auth** tab, the scope configuration must contain **exactly** the scopes listed above — a missing scope (or an extra _required_ scope Agent-Int doesn't request) makes the authorize step fail with a scope mismatch error.
:::

### Setting up the public app

1. Create a developer account at [developers.hubspot.com](https://developers.hubspot.com/) and create a **public app**.
2. On the app's **Auth** tab, copy the **Client ID** and **Client Secret** into the credential form.
3. On the same tab, add the redirect URI shown on the credential form: `<APP_URL>/oauth2/callback`.
4. Configure the scope list exactly as shown above.
5. Save the credential, click **Authorize**, and grant access to your HubSpot account.

# Microsoft OneDrive

Lets Agent-Int browse and read files in OneDrive and SharePoint document libraries via the Microsoft Graph API — used by the [knowledge base](/guide/knowledge-base) cloud import, and available to agents through `call_api`. Authenticates with Azure AD OAuth2 using an app registration you create in the Azure Portal.

[Microsoft Graph OneDrive API documentation](https://learn.microsoft.com/en-us/graph/api/resources/onedrive)

## What you need

| Field                      | Required | Notes                                                                                           |
| -------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| Client ID (Application ID) | Yes      | From your Azure AD app registration                                                             |
| Client Secret              | Yes      | Secret                                                                                          |
| Scopes                     | Yes      | Space-separated Microsoft Graph scopes — the default covers OneDrive and SharePoint read access |

Default scopes: `User.Read`, `Files.Read.All` (OneDrive files), `Sites.Read.All` (SharePoint document libraries), plus identity and `offline_access` for token refresh. The scope list is editable — grant write scopes (e.g. `Files.ReadWrite.All`) only if your agents need them via `call_api`; the knowledge base import is read-only. The integration uses the multi-tenant `common` endpoint, so both personal Microsoft accounts and work/school accounts can authorize.

## Creating the app registration in Azure

1. Open the [Azure Portal](https://portal.azure.com/) and go to **App registrations → New registration**.
2. Name the app. Under **Supported account types**, choose an option that includes the accounts you'll sign in with (e.g. _Accounts in any organizational directory and personal Microsoft accounts_).
3. Under **Redirect URI**, choose platform **Web** and enter the URI from the credential form: `<APP_URL>/oauth2/callback`.
4. Register, then on the **Overview** page copy the **Application (client) ID** into the credential form.
5. Go to **Certificates & secrets → New client secret**, create one, and copy its **Value** (not the Secret ID) immediately — it's shown only once.
6. Save the credential in Agent-Int, click **Authorize**, and sign in with the account whose files you want to access.

::: tip Reuse one app registration
If you already created an Azure app registration for the [Microsoft Outlook](/integrations/microsoft-outlook) integration, the same Client ID and Secret work here — each credential still only requests its own scopes during authorization.
:::

::: tip Client secret expiry
Azure client secrets always have an expiry (up to 24 months). Note the date — when it lapses, create a new secret in **Certificates & secrets**, update the credential, and re-authorize.
:::

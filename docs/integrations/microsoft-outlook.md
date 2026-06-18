# Microsoft Outlook

Lets agents read, send, and manage email via the Microsoft Graph API. Authenticates with Azure AD OAuth2 using an app registration you create in the Azure Portal.

[Microsoft Graph mail API documentation](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview)

## What you need

| Field                      | Required | Notes                               |
| -------------------------- | -------- | ----------------------------------- |
| Client ID (Application ID) | Yes      | From your Azure AD app registration |
| Client Secret              | Yes      | Secret                              |

Scopes requested: `User.Read`, `Mail.Read`, `Mail.Send`, `Mail.ReadWrite`, `MailboxSettings.Read` (Microsoft Graph), plus identity and `offline_access` for token refresh. The integration uses the multi-tenant `common` endpoint, so both personal Microsoft accounts and work/school accounts can authorize.

## Creating the app registration in Azure

1. Open the [Azure Portal](https://portal.azure.com/) and go to **App registrations → New registration**.
2. Name the app. Under **Supported account types**, choose an option that includes the accounts you'll sign in with (e.g. _Accounts in any organizational directory and personal Microsoft accounts_).
3. Under **Redirect URI**, choose platform **Web** and enter the URI from the credential form: `<APP_URL>/oauth2/callback`.
4. Register, then on the **Overview** page copy the **Application (client) ID** into the credential form.
5. Go to **Certificates & secrets → New client secret**, create one, and copy its **Value** (not the Secret ID) immediately — it's shown only once.
6. Save the credential in Valmis, click **Authorize**, and sign in with the mailbox account.

::: tip Client secret expiry
Azure client secrets always have an expiry (up to 24 months). Note the date — when it lapses, create a new secret in **Certificates & secrets**, update the credential, and re-authorize.
:::

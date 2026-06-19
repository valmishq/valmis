# Microsoft Teams

Lets agents work with **Microsoft Teams** through the Microsoft Graph API — **read teams and channels, and post channel messages and chats**. Authenticates via Azure AD OAuth2, with the access token sent as a Bearer token.

[Microsoft Teams API (Graph) documentation](https://learn.microsoft.com/en-us/graph/api/resources/teams-api-overview)

## What you need

| Field                     | Required | Notes                                |
| ------------------------- | -------- | ------------------------------------ |
| Client ID (Application ID) | Yes     | From your Azure AD app registration  |
| Client Secret             | Yes      | Secret — from Certificates & secrets |

## Setting up the app

1. In the [Azure Portal](https://portal.azure.com/), open **App registrations → New registration**.
2. Under **Authentication**, add a **Web** platform with the redirect URI shown on the credential form: `<APP_URL>/oauth2/callback`.
3. Under **Certificates & secrets**, create a **client secret** and copy its **Value**.
4. Under **API permissions**, add the delegated Microsoft Graph permissions: **User.Read**, **Team.ReadBasic.All**, **Channel.ReadBasic.All**, **ChannelMessage.Send**, **Chat.ReadWrite**, and **offline_access** — then grant admin consent if your tenant requires it.
5. From **Overview**, copy the **Application (client) ID**, and paste it plus the secret into the credential form.
6. Save the credential, click **Authorize**, and sign in with the Microsoft account the agent should act as.

::: info Some permissions need admin consent
`Team.ReadBasic.All` and `Channel.ReadBasic.All` may require a Microsoft 365 administrator to grant consent for your organization before the authorize step succeeds.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List the teams I'm a member of."
- "Post 'Deploy finished' to the General channel of the Engineering team."
- "What are the channels in the Marketing team?"

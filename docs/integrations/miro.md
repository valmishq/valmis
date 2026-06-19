# Miro

Lets agents manage **boards, items, and connectors** in Miro. Authenticates with an access token, sent as a Bearer token.

[Miro REST API documentation](https://developers.miro.com/reference/use-access-token-for-rest-api-requests)

## What you need

| Field        | Required | Notes  |
| ------------ | -------- | ------ |
| Access Token | Yes      | Secret |

## Getting your access token

1. In Miro, open **Profile settings → Your apps** and create an app in your Developer team, or go to [miro.com/app/settings](https://miro.com/app/settings/).
2. In the app settings, leave the **expiring access token** option unchecked (so the token does not expire), and select the scopes the agent needs.
3. Click **Install app & get OAuth token** and copy the token shown into the credential form.

::: tip This is not a profile API key
Miro has no one-click "personal API key." You create a (possibly throwaway) app and use its **Install app** dialog to obtain a static token bound to your team — that token is what you paste here.
:::

# Dropbox

Lets agents work with files in your Dropbox via an access token, and powers the [knowledge base](/guide/knowledge-base) cloud import. Recommended for single-account, server-side use.

[Dropbox OAuth guide](https://developers.dropbox.com/oauth-guide)

## What you need

| Field           | Required | Notes                                                                                    |
| --------------- | -------- | ---------------------------------------------------------------------------------------- |
| Access Token    | Yes      | Secret                                                                                   |
| App Access Type | Yes      | **App Folder** (default) or **Full Dropbox** — must match your Dropbox app's access type |

## Getting your access token

1. Open the [Dropbox App Console](https://www.dropbox.com/developers/apps) and create an app (or open an existing one).
2. When creating it, choose the access type: **App Folder** (a dedicated folder named after the app) or **Full Dropbox** (the entire account).
3. On the app's **Settings** tab, under **OAuth 2 → Generated access token**, click **Generate**.
4. Copy the token into the credential form, and set **App Access Type** to the same value you chose in step 2.

::: warning Token lifetime
Dropbox has moved to short-lived access tokens by default. A generated token may expire after a few hours depending on your app settings — if API calls start failing with 401, generate a fresh token and update the credential.
:::

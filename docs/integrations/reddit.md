# Reddit

Lets agents read and write Reddit on your behalf — posts, comments, private messages, and account data — via OAuth2.

[Reddit OAuth2 documentation](https://www.reddit.com/dev/api/oauth)

## What you need

| Field         | Required | Notes                                                 |
| ------------- | -------- | ----------------------------------------------------- |
| Client ID     | Yes      | Shown beneath your app's name on the Reddit apps page |
| Client Secret | Yes      | Secret — only **web app** type applications have one  |

Scopes requested: `identity read submit privatemessages history mysubreddits`.

## Creating the Reddit app

1. Open [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) while signed in.
2. Click **create another app…** at the bottom.
3. Choose type **web app** — the other types don't issue a client secret and won't work here.
4. Set the **redirect uri** to the value from the credential form: `<APP_URL>/oauth2/callback`.
5. Create the app. The **client ID** is the string under the app name; the **secret** is labeled.
6. Enter both in the credential form, save, then click **Authorize** and approve access with your Reddit account.

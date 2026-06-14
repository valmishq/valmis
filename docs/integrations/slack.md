# Slack

Lets agents act as a Slack bot — send messages, manage channels, read history, work with files and reactions — via OAuth2.

[Slack OAuth documentation](https://api.slack.com/authentication/oauth-v2)

## What you need

| Field                   | Required | Notes                                                                                                            |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| Client ID               | Yes      | From your Slack app settings                                                                                     |
| Client Secret           | Yes      | Secret — same place                                                                                              |
| Bot Token Scopes        | Yes      | Space-separated bot scopes ([scope reference](https://api.slack.com/scopes)) — a broad default list is prefilled |
| Signing Secret          | No\*     | Secret — **Basic Information → App Credentials**. Required only for the [Slack app trigger](/integrations/triggers/slack). |
| App Manifest Config Token | No     | Secret (`xoxe.xoxp-…`). Optional — lets the app trigger auto-register its request URL via the Manifest API.      |
| App Manifest Refresh Token | No    | Secret (`xoxe-1-…`). The matching refresh token; config tokens expire (~12h) and are rotated automatically.      |
| Slack App ID            | No       | e.g. `A0123456789`. Needed alongside the config token for manifest auto-registration.                            |

\* The Signing Secret is only used for app triggers — credentials used purely for agent actions (sending messages, etc.) don't need it.

The default scope list covers reading and writing channels, groups, DMs, files, users, reactions, pins, and bookmarks. Trim it to what your agent actually needs — the scopes in this field are exactly what gets requested when you authorize.

## Creating the Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App → From scratch**, picking your workspace.
2. Under **Basic Information → App Credentials**, copy the **Client ID** and **Client Secret** into the credential form.
3. Under **OAuth & Permissions → Redirect URLs**, add the URI from the credential form: `<APP_URL>/oauth2/callback`.

   ::: warning HTTPS required
   Slack only accepts `https://` redirect URLs. Your `APP_URL` must be an HTTPS domain — a plain `http://localhost` deployment cannot complete Slack OAuth.
   :::

4. Save the credential, click **Authorize**, and install the app to your workspace in the browser flow. The granted bot scopes are the ones from the credential's scope field.
5. Invite the bot to the channels it should work in (`/invite @your-bot`).

## App triggers

A Slack credential can fire a workflow when a **message is posted** to a channel (via the Slack **Events API**). It needs the **Signing Secret** above, the **`channels:history`** scope on the app (subscribing to `message.channels` requires it — auto-registration fails with `invalid_manifest` otherwise), and either a manual Request URL or automatic registration through the Manifest API (config token + refresh token + App ID). The full setup, scopes, channel filtering, and payload shape live on the [Slack app trigger page](/integrations/triggers/slack).

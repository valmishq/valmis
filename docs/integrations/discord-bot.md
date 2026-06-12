# Discord Bot

Connects a Discord bot for two purposes:

- As a [messaging channel](/guide/channels) — chat with an agent by DM-ing your bot
- As an API credential — agents can call the Discord API as the bot via `call_api`

[Discord developer documentation](https://discord.com/developers/docs/intro)

## What you need

| Field     | Required | Notes  |
| --------- | -------- | ------ |
| Bot Token | Yes      | Secret |

## Creating the bot and getting the token

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and click **New Application**.
2. In the left menu, select **Bot**.
3. Click **Reset Token** and copy the token — it is shown only once.
4. Still under **Bot → Privileged Gateway Intents**, enable **Message Content Intent** (required so the bot can read your DM text; the Direct Messages intent is enabled by default).
5. Paste the token into the credential form.

::: warning Message Content Intent is required
If the intent is not enabled, the bot connects but cannot read what you write — pairing and chat will silently fail. This is the most common setup mistake.
:::

## Inviting the bot

To DM the bot you must share a server with it: under **OAuth2 → URL Generator** select the `bot` scope, open the generated URL, and invite the bot to any server you're in. The bot only responds in **direct messages** — messages in servers are ignored.

## Using it as a channel

Once the credential exists, pair it with an agent under **Account → Channels** — see the [channels guide](/guide/channels#connecting-a-channel). The connection runs outbound from your server (Discord gateway WebSocket); no public webhook endpoint is needed. Human-in-the-loop options arrive as message buttons.

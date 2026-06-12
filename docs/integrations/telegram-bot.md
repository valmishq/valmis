# Telegram Bot

Connects a Telegram bot so you can [chat with an agent from Telegram](/guide/channels). The platform receives messages via long polling — no public webhook endpoint or inbound port is needed.

[Telegram bot documentation](https://core.telegram.org/bots#how-do-i-create-a-bot)

## What you need

| Field        | Required | Notes                                       |
| ------------ | -------- | ------------------------------------------- |
| Bot Token    | Yes      | Secret — format `123456:ABC-DEF...`         |
| Bot Username | Yes      | Without the `@` prefix, e.g. `my_agent_bot` |

## Creating the bot with @BotFather

1. In Telegram, open [t.me/BotFather](https://t.me/BotFather) — the official bot for creating bots.
2. Send `/newbot` and follow the prompts: choose a display name, then a username (must end in `bot`).
3. BotFather replies with the **bot token** — copy it into the credential form.
4. Enter the **bot username** you chose (without `@`).

The credential form's **Test** action calls Telegram's `getMe` to verify the token.

## Pairing with an agent

Once the credential exists, connect it under **Account → Channels**: pick Telegram, an agent, and this credential to get a pairing code, then DM your bot:

```
/pair <CODE>
```

See the [channels guide](/guide/channels) for the full command list, session handling, and settings. Human-in-the-loop questions arrive as tappable inline-keyboard buttons.

::: tip One bot, one platform instance
The bot token is consumed by your Agent-Int server's polling loop. Don't reuse the same bot token in another bot framework or a second Agent-Int install — Telegram delivers each update to only one consumer.
:::

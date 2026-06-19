# Twilio

Lets agents send SMS, WhatsApp, and voice messages and manage phone numbers through the **Twilio REST API**. Authenticates with your Account SID and Auth Token, sent as HTTP Basic Auth on every request.

[Twilio API documentation](https://www.twilio.com/docs/usage/api)

## What you need

| Field       | Required | Notes                                                              |
| ----------- | -------- | ------------------------------------------------------------------ |
| Account SID | Yes      | Your account identifier — starts with `AC`. Also the Basic Auth username. |
| Auth Token  | Yes      | Secret — the password half of the Basic Auth pair.                 |

## Getting your credentials

1. Sign in to the [Twilio Console](https://console.twilio.com).
2. On the dashboard's **Account Info** panel, find your **Account SID** and **Auth Token** (click to reveal the token).
3. Copy both into the credential form. The Account SID is sent as the Basic Auth username and the Auth Token as the password.

::: warning Treat the Auth Token like a password
The Auth Token grants full access to your Twilio account, including the ability to spend money on messages and calls. Store it carefully and rotate it from the Console if it is ever exposed.
:::

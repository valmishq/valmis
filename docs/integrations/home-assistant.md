# Home Assistant

Lets agents control and query your local or remote Home Assistant instance — lights, sensors, automations, anything exposed by its REST API. Authenticates with a Long-Lived Access Token sent as a Bearer token. HTTP and HTTPS are both supported.

[Home Assistant REST API documentation](https://developers.home-assistant.io/docs/api/rest/)

## What you need

| Field        | Required | Notes                                                                      |
| ------------ | -------- | -------------------------------------------------------------------------- |
| Access Token | Yes      | Secret — a Long-Lived Access Token                                         |
| Base URL     | Yes      | Full URL of your instance, including protocol and port. No trailing slash. |

Base URL examples: `http://192.168.1.10:8123`, `https://homeassistant.local:8123`, or `https://your.host` for HTTPS without a custom port.

## Getting your token

1. Open your Home Assistant web UI and click your **user profile** (bottom-left avatar).
2. On the **Security** tab, scroll to **Long-Lived Access Tokens**.
3. Click **Create Token**, name it (e.g. "Agent-Int"), and copy the token — it is shown only once.
4. Paste the token and your instance's base URL into the credential form.

::: tip Reachability
The Agent-Int **server** makes the API calls, so the base URL must be reachable from where Agent-Int runs — not from your browser. If Agent-Int runs in Docker on the same LAN, a local IP like `http://192.168.1.10:8123` works; `localhost` does not.
:::

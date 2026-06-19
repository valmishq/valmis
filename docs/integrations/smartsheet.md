# Smartsheet

Lets agents manage **sheets, rows, columns, and reports** in Smartsheet. Authenticates with a personal API access token, sent as a Bearer token.

[Smartsheet API authentication documentation](https://developers.smartsheet.com/api/smartsheet/guides/basics/authentication)

## What you need

| Field            | Required | Notes                                                    |
| ---------------- | -------- | -------------------------------------------------------- |
| API Access Token | Yes      | Secret                                                   |
| API Base URL     | Yes      | US `https://api.smartsheet.com/2.0`; Gov and EU Regions differ |

## Getting your access token

1. Sign in to Smartsheet and open **Account (profile image, bottom-left) → Personal Settings → API Access**.
2. Click **Generate new access token**, name it, and copy it — it is shown only once.
3. Paste it into the credential form. Change **API Base URL** only if you are on Smartsheet Gov or the EU region.

::: tip UI tokens are long-lived
The token you generate in **Personal Settings → API Access** does not expire (unlike short-lived OAuth tokens), which is what you want for an always-on agent.
:::

# Typeform

Lets agents manage **forms and read responses** in Typeform. Authenticates with a personal access token, sent as a Bearer token.

[Typeform personal access token documentation](https://www.typeform.com/developers/get-started/personal-access-token/)

## What you need

| Field                 | Required | Notes                                                    |
| --------------------- | -------- | -------------------------------------------------------- |
| Personal Access Token | Yes      | Secret — starts with `tfp_`                              |
| API Base URL          | Yes      | Global `https://api.typeform.com`, or EU `https://api.eu.typeform.com` |

## Getting your access token

1. Sign in to Typeform and open **Account → Personal tokens**, or go to [admin.typeform.com/user/tokens](https://admin.typeform.com/user/tokens).
2. Click **Generate a new token**, name it, and select the scopes the agent needs (for example, *Read forms* and *Read responses*).
3. Copy the token (starts with `tfp_`) into the credential form. Set **API Base URL** to the EU host only if your account is on EU data residency.

::: tip Scope to read-only when possible
If the agent only reads responses, grant read scopes only. You can always create a second, broader token later.
:::

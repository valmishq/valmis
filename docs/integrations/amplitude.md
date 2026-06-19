# Amplitude

Lets agents pull data from **Amplitude** analytics via the Dashboard / Export REST API — **events, charts, and cohorts**. Authenticates with your project API key and secret key sent as HTTP Basic Auth.

[Amplitude Dashboard REST API documentation](https://amplitude.com/docs/apis/analytics/dashboard-rest)

## What you need

| Field      | Required | Notes                                                                  |
| ---------- | -------- | ---------------------------------------------------------------------- |
| API Key    | Yes      | Secret — sent as the Basic Auth username                               |
| Secret Key | Yes      | Secret — sent as the Basic Auth password                              |
| API Host   | Yes      | Standard `https://amplitude.com` or EU `https://analytics.eu.amplitude.com` |

## Getting your keys

1. Sign in to Amplitude and open **Settings → Projects** (Organization Settings), then select your project.
2. On the project's **General** tab, copy the **API Key** and **Secret Key** into the credential form.
3. Set **API Host** to the EU host if your data is stored in the EU data center; otherwise keep the default.

::: warning Keep the Secret Key safe
The project Secret Key grants full access to that project's analytics data. Treat it like a password and only attach it to agents that need analytics.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "How many active users did we have last week?"
- "List the saved charts (annotations) in this project."
- "Pull the daily count of the `purchase` event for the last 30 days."

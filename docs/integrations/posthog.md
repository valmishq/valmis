# PostHog

Lets agents query **PostHog** product analytics — **events, insights, persons, and feature flags**. Authenticates with a personal API key sent as a Bearer token.

[PostHog API documentation](https://posthog.com/docs/api)

## What you need

| Field            | Required | Notes                                                                |
| ---------------- | -------- | -------------------------------------------------------------------- |
| Personal API Key | Yes      | Secret                                                               |
| API Host         | Yes      | US Cloud `https://us.posthog.com`, EU Cloud `https://eu.posthog.com`, or your self-hosted URL |

## Getting your key

1. Sign in to PostHog and open **Settings → Personal API keys** (under your account, top-right).
2. Click **Create personal API key**, name it, and grant the **scopes** the agent needs — e.g. `query:read`, `insight:read`, `person:read`.
3. Copy the key into the credential form — it is shown only once.
4. Set **API Host** to match your PostHog region (US or EU Cloud), or your self-hosted URL.

::: warning Pick the right region host
PostHog Cloud is split into US and EU. A key from the US region won't work against the EU host and vice-versa — set **API Host** to the region your project lives in.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "How many `signed_up` events happened in the last 7 days?"
- "Show me the results of the 'Weekly active users' insight."
- "Is the `new-checkout` feature flag enabled, and for what percentage of users?"

# Strapi

Lets agents read and write content in a self-hosted **Strapi** CMS (v4/v5) — **entries across your content collections**. Authenticates with an API token sent as a Bearer token.

[Strapi API tokens documentation](https://docs.strapi.io/cms/features/api-tokens)

## What you need

| Field           | Required | Notes                                                                  |
| --------------- | -------- | ---------------------------------------------------------------------- |
| Base URL        | Yes      | Your Strapi instance root, e.g. `https://cms.example.com`              |
| API Token       | Yes      | Secret                                                                  |
| Test Collection | Yes      | The plural API id of a collection the token can read, e.g. `articles`  |

## Getting your API token

1. In the Strapi admin panel, open **Settings → API Tokens**.
2. Click **Create new API Token**, name it, and choose a **Token type** — **Read-only** or **Full access** depending on what the agent needs.
3. Save and copy the token into the credential form — it is shown only once.
4. Enter your instance's **Base URL** and a **Test Collection** the token can read (used only to verify the connection).

::: tip Why a test collection?
Strapi API tokens have no "who am I" endpoint, so the connection test reads one entry from a collection you name (default `users`). Use any collection the token can access — e.g. `articles`. It only needs read access for the test.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List the 5 most recent articles and their publish dates."
- "Create a new 'announcement' entry titled 'Holiday hours' with today's date."
- "Find the article with slug 'getting-started' and show its body."

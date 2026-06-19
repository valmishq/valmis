# Meilisearch

Lets agents manage a **Meilisearch** instance (Cloud or self-hosted) — **indexes, documents, and search settings**. Authenticates with an API key sent as a Bearer token.

[Meilisearch authorization documentation](https://www.meilisearch.com/docs/reference/api/authorization)

## What you need

| Field    | Required | Notes                                                                          |
| -------- | -------- | ------------------------------------------------------------------------------ |
| Host URL | Yes      | Instance URL — self-hosted `http://localhost:7700` or Cloud `https://ms-xxxx.region.meilisearch.io` |
| API Key  | Yes      | Secret — a master key, or a key with the `keys.get` / `indexes.get` actions    |

## Getting your key

- **Meilisearch Cloud:** open your project, go to **Settings / API keys**, and copy a key (the Default Admin key, or a custom one).
- **Self-hosted:** the **master key** is the value you set with `MEILI_MASTER_KEY` when starting the server. For day-to-day use, call `GET /keys` with the master key to obtain a scoped API key.

Paste the key into the credential form and set **Host URL** to your instance (no trailing slash).

::: tip Use a scoped key, not the master key
The master key can do anything, including managing other keys. For an agent, prefer a key scoped to just the indexes and actions it needs.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List the indexes and how many documents each holds."
- "Search the `docs` index for 'reset password' and show the top results."
- "Add these FAQ entries as documents to the `faq` index."

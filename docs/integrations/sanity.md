# Sanity

Lets agents query and mutate content in **Sanity** with GROQ — **documents in your Content Lake**. Authenticates with a robot/API token sent as a Bearer token.

[Sanity HTTP API documentation](https://www.sanity.io/docs/http-auth)

## What you need

| Field       | Required | Notes                                                              |
| ----------- | -------- | ------------------------------------------------------------------ |
| API Token   | Yes      | Secret — a robot token (Viewer for read, Editor for write)         |
| Project ID  | Yes      | e.g. `abc12xyz`, from your project settings                        |
| Dataset     | Yes      | e.g. `production`                                                  |
| API Version | Yes      | A dated version with a leading `v`, e.g. `v2025-02-19`             |

## Getting your token

1. Open [manage.sanity.io](https://www.sanity.io/manage), select your project, and go to **API → Tokens**.
2. Click **Add API token**, name it, and choose a permission — **Viewer** for read-only or **Editor**/**Deploy Studio** for writes.
3. Copy the token into the credential form — it is shown only once.
4. From the project's **API** page, copy the **Project ID**; set **Dataset** (usually `production`) and an **API Version** date.

::: tip Pin the API version to a date
Always set a dated `API Version` (e.g. `v2025-02-19`). Pinning to a date keeps query behaviour stable as Sanity evolves its API.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "How many documents of type `post` are published?"
- "Fetch the title and slug of the 10 most recent `post` documents."
- "Create a draft `post` titled 'Q3 roadmap'."

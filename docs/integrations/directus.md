# Directus

Lets agents read and write data in a self-hosted **Directus** backend — **items, collections, and files**. Authenticates with a static access token sent as a Bearer token.

[Directus authentication documentation](https://directus.io/docs/guides/connect/authentication)

## What you need

| Field        | Required | Notes                                                        |
| ------------ | -------- | ------------------------------------------------------------ |
| Base URL     | Yes      | Your Directus instance root, e.g. `https://directus.example.com` |
| Static Token | Yes      | Secret — non-expiring token assigned to a Directus user      |

## Getting your token

1. In the Directus admin app, open the **User Directory** and select (or create) the user the agent should act as.
2. Scroll to the **Token** field, generate a static token, and **save the user**.
3. Copy the token into the credential form, and set **Base URL** to your instance root (no trailing slash).

::: tip Permissions follow the user's role
A static token inherits the permissions of the user it belongs to. Create a dedicated user with a role scoped to exactly the collections the agent should touch.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List the 10 most recent items in the `orders` collection."
- "Create a new item in `tasks` with title 'Review Q3 report' and status 'open'."
- "How many items are in the `customers` collection?"

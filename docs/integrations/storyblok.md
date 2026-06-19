# Storyblok

Lets agents create and edit content in **Storyblok** via the Management API — **stories, components, and assets**. Authenticates with a personal access token sent raw in the `Authorization` header (no `Bearer` prefix).

[Storyblok Management API documentation](https://www.storyblok.com/docs/api/management/getting-started/authentication)

## What you need

| Field                  | Required | Notes                                                                            |
| ---------------------- | -------- | -------------------------------------------------------------------------------- |
| Personal Access Token  | Yes      | Secret                                                                            |
| API Base URL           | Yes      | Region host — EU `https://mapi.storyblok.com/v1`, US `https://api-us.storyblok.com/v1`, AP `https://api-ap.storyblok.com/v1`, CA `https://api-ca.storyblok.com/v1` |

## Getting your token

1. Sign in to Storyblok and open **My Account → Account settings → Personal access tokens**.
2. Generate a token and copy it into the credential form.
3. Set **API Base URL** to match your space's region (shown in your space settings; EU is the default).

::: warning Use the Management API token, not the Content Delivery token
The Management API (read **and** write content) uses your **personal access token** in the `Authorization` header. The space's "preview/public" delivery token (a `?token=` query parameter) is read-only and won't work here.
:::

::: tip Region matters
Storyblok partitions data by region. If requests fail with auth errors despite a valid token, confirm the **API Base URL** matches your space's region.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List the spaces this token can access."
- "Create a new story 'blog/launch-day' using the 'article' component."
- "Find the story with slug 'home' and update its headline field."

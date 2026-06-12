# GitHub

Lets agents use the GitHub REST API — repositories, issues, pull requests, actions, and more. Authenticates with a Personal Access Token sent as a Bearer token.

[GitHub REST authentication documentation](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api)

## What you need

| Field                 | Required | Notes                            |
| --------------------- | -------- | -------------------------------- |
| Personal Access Token | Yes      | Secret — classic or fine-grained |

## Getting your token

1. Open [github.com/settings/tokens](https://github.com/settings/tokens).
2. Choose **Fine-grained tokens → Generate new token** (recommended) or a classic token.
3. For fine-grained tokens: select which repositories the token may access and grant only the permissions the agent needs (e.g. _Issues: read/write_, _Pull requests: read_).
4. Generate and copy the token into the credential form.

::: tip Scope to the task
Fine-grained tokens are recommended over classic tokens: they can be restricted to specific repositories and individual permissions, which limits what an agent can do with the credential.
:::

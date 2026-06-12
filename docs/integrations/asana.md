# Asana

Lets agents work with your Asana projects and tasks. Authenticates with a Personal Access Token sent as a Bearer token on every request.

[Asana PAT documentation](https://developers.asana.com/docs/personal-access-token)

## What you need

| Field        | Required | Notes                            |
| ------------ | -------- | -------------------------------- |
| Access Token | Yes      | Secret — a Personal Access Token |

## Getting your token

1. Open the [Asana developer console](https://app.asana.com/0/developer-console).
2. Under **Personal access tokens**, select **Create new token**.
3. Name the token and create it.
4. Copy the token — it is shown only once — and paste it into the credential form.

The token acts as your Asana user: the agent can access whatever projects and workspaces your account can.

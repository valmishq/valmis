# Jira

Lets agents work with issues, projects, and boards in **Jira Software Cloud**. Authenticates with your Atlassian account email plus an API token, sent as HTTP Basic Auth on every request.

[Atlassian API token documentation](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)

::: warning Jira Cloud only
This integration is for Jira Cloud (`*.atlassian.net`). It does not work with Jira Server or Data Center.
:::

## What you need

| Field         | Required | Notes                                                                                   |
| ------------- | -------- | --------------------------------------------------------------------------------------- |
| Email Address | Yes      | The email of your Atlassian account                                                     |
| API Token     | Yes      | Secret                                                                                  |
| Jira Domain   | Yes      | Base URL of your instance, e.g. `https://yourcompany.atlassian.net` — no trailing slash |

## Getting your API token

1. Open [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
2. Click **Create API token**, name it, and create.
3. Copy the token — it is shown only once — into the credential form, together with your account email and your Jira domain.

::: tip New tokens may lag
A freshly created Atlassian token can take up to a minute before it starts working. If the credential test fails immediately after creation, wait briefly and retry.
:::

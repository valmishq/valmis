# Confluence

Lets agents manage **pages, spaces, and content** in **Confluence Cloud**. Authenticates with your Atlassian account email plus an API token, sent as HTTP Basic Auth (the same scheme as Jira).

[Atlassian basic-auth for REST APIs documentation](https://developer.atlassian.com/cloud/confluence/basic-auth-for-rest-apis/)

::: warning Confluence Cloud only
This integration is for Confluence Cloud (`*.atlassian.net`). It does not work with Confluence Server or Data Center.
:::

## What you need

| Field                  | Required | Notes                                                |
| ---------------------- | -------- | ---------------------------------------------------- |
| Atlassian Account Email | Yes     | The email of your Atlassian account                  |
| API Token              | Yes      | Secret                                               |
| Site Subdomain         | Yes      | The `xxx` in `https://xxx.atlassian.net`             |

## Getting your API token

1. Open [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
2. Click **Create API token**, name it, and create — copy it, as it is shown only once.
3. In the credential form, enter your **Atlassian Account Email**, paste the **API Token**, and set the **Site Subdomain**.

::: tip One token for all Atlassian apps
The same Atlassian account email + API token works for Jira and Confluence. You can reuse the token across both integrations if your account has access to each product.
:::

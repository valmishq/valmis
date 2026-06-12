# Canva

Lets agents read and write designs, upload assets, use brand templates, and access profile information through the Canva Connect API. Authenticates via OAuth2 (with PKCE) using an integration you create in the Canva Developer Portal.

[Canva Connect documentation](https://www.canva.dev/docs/connect/)

## What you need

| Field         | Required | Notes                                                                                   |
| ------------- | -------- | --------------------------------------------------------------------------------------- |
| Client ID     | Yes      | From your Canva integration                                                             |
| Client Secret | Yes      | Secret                                                                                  |
| Scopes        | Yes      | Space-separated; **must exactly match** the scopes enabled in your integration settings |

Default scopes: `design:content:read design:content:write design:meta:read asset:read asset:write brandtemplate:meta:read brandtemplate:content:read profile:read comment:read comment:write`.

Available scopes: `design:content:read`, `design:content:write`, `design:meta:read`, `asset:read`, `asset:write`, `brandtemplate:meta:read`, `brandtemplate:content:read`, `profile:read`, `folder:read`, `comment:read`, `comment:write`, `collaboration:event`.

## Setting up the Canva integration

1. Open the [Canva Developer Portal](https://www.canva.com/developers/) and create an integration.
2. Under **Your integrations → Configuration**, copy the **Client ID** and generate a **Client Secret**.
3. Enable the scopes you need — then enter the _same_ list in the credential form's Scopes field. A mismatch causes the authorization to fail.
4. Register the redirect URI shown on the credential form: `<APP_URL>/oauth2/callback`.
5. Save the credential, click **Authorize**, and grant access in the browser.

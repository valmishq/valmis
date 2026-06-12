# Airtable

Lets agents read and write records and inspect base schemas in your Airtable bases. Two credential variants are available — for most self-hosted setups the **personal access token** is the simpler and recommended choice.

[Airtable API documentation](https://airtable.com/developers/web/api/authentication)

## Option 1: Personal Access Token (recommended)

**Credential type:** Airtable (Personal Access Token) — sent as a Bearer token.

| Field                 | Required | Notes  |
| --------------------- | -------- | ------ |
| Personal Access Token | Yes      | Secret |

### Getting the token

1. Open [airtable.com/create/tokens](https://airtable.com/create/tokens) (Builder Hub → Personal access tokens).
2. Click **Create token** and give it a name.
3. Add scopes — recommended: `data.records:read`, `data.records:write`, `schema.bases:read`.
4. Grant the token access to the bases or workspaces the agent should use.
5. Create the token and copy it — it is shown only once.

## Option 2: OAuth2

**Credential type:** Airtable (OAuth2) — lets a user grant access to their own bases without sharing a token. Uses PKCE.

| Field         | Required | Notes                                |
| ------------- | -------- | ------------------------------------ |
| Client ID     | Yes      | From your Airtable OAuth integration |
| Client Secret | Yes      | Secret                               |

Scopes requested: `user.email:read data.records:read data.records:write schema.bases:read`.

### Setting up the OAuth integration

1. Create an OAuth integration in Airtable's Builder Hub (see the [OAuth reference](https://airtable.com/developers/web/api/oauth-reference)).
2. Register the redirect URI shown on the credential form: `<APP_URL>/oauth2/callback`.
3. Copy the integration's client ID and secret into the credential form.
4. Save, then click **Authorize** and grant access in the browser.

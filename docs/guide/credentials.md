# Credentials

Credentials are encrypted sets of secrets for third-party services — API keys, tokens, OAuth2 grants. You store them once under **Credentials**, then attach them to agents, which use them through the `call_api` tool without ever seeing the raw secret.

For service-by-service instructions on **where to find each key or token**, see the [integration docs](/integrations/).

## Adding a credential

**Credentials → Add credential** opens a two-step dialog:

1. **Pick a service** — searchable list of all [supported integrations](/integrations/).
2. **Fill in the form** — a name for the credential plus the service-specific fields (key, token, URLs, options). Each form links to the service's official documentation.

### Credential types

| Type             | How it authenticates                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| **API key**      | Key injected as a header, query parameter, or body field — whatever the service expects.              |
| **Bearer token** | `Authorization: Bearer <token>` header.                                                               |
| **Basic auth**   | `Authorization: Basic` with Base64-encoded username:password.                                         |
| **OAuth2**       | Full authorization-code flow — you provide a client ID/secret, then authorize in the browser (below). |
| **Custom**       | Service-specific mapping (e.g. Trello's key + token pair).                                            |

## OAuth2 credentials

For OAuth2 services (Gmail, Slack, Notion, HubSpot, …) the flow has two parts:

1. **Create an app in the provider's developer console** and paste its client ID and secret into the credential form. The form displays the **authorized redirect URI** to register in the provider console — it is always:

   ```
   <APP_URL>/oauth2/callback
   ```

   with copy button provided. `APP_URL` must be your real public URL ([configuration](/guide/configuration#urls-and-cors)).

2. **Authorize** — after saving, click the authorize action. You're redirected to the provider to grant access, then back to Valmis. Status updates to verified on success.

Tokens are refreshed automatically: the platform proactively refreshes expiring OAuth2 access tokens and retries once on a 401 by refreshing. If a grant is revoked on the provider side, use **Re-authorize** on the credential.

The OAuth2 `state` parameter is HMAC-signed with a 5-minute expiry, and PKCE is used where the provider supports it.

## Testing a credential

Credentials for services that support it show a **Test** button — the platform makes a real, harmless API call (e.g. "who am I") and shows the connected account on success. Test after creating a credential and after rotating a secret.

## Security properties

- **Encrypted at rest** — credential data is encrypted with AES-256-GCM using your `CREDENTIAL_ENCRYPTION_KEY`. The database never stores plaintext secrets.
- **Redacted in the UI** — when you edit a credential, secret fields display as redacted placeholders. Submitting the form without touching them keeps the existing values; the real secret is never sent back to the browser.
- **Never in the sandbox** — agents receive only credential metadata (name, service, non-secret properties like a base URL). The actual secret is injected server-side when `call_api` runs.
- **Live revocation** — detaching a credential from an agent takes effect immediately, even for runs already in progress.

## Attaching credentials to agents

A credential does nothing until you attach it to an agent on the [agent form](/guide/agents#credentials). Attach only what each agent needs — the set of attached credentials defines the blast radius of a misbehaving or manipulated agent. Deleting a credential detaches it from all agents automatically.

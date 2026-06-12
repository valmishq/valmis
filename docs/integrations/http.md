# Generic HTTP Auth

Four generic credential types for APIs that don't have a dedicated integration. Most REST APIs accept one of these patterns — check the service's API documentation to see which.

## Bearer Token

Sends `Authorization: Bearer <token>` on every request.

| Field | Required | Notes                                                 |
| ----- | -------- | ----------------------------------------------------- |
| Token | Yes      | Secret — the token value, without the `Bearer` prefix |

Use for: any API documented as "Bearer token", "access token in the Authorization header", or most modern REST APIs.

## API Key (Header)

Sends the key in a custom HTTP header you name.

| Field       | Required | Notes                                                               |
| ----------- | -------- | ------------------------------------------------------------------- |
| Header Name | Yes      | Default `X-API-Key`. Common alternatives: `X-Auth-Token`, `Api-Key` |
| API Key     | Yes      | Secret                                                              |

Use for: APIs documented as "send your key in the `X-API-Key` header" (or any custom header).

## API Key (Query Parameter)

Appends the key to every request URL as `?paramName=value`.

| Field          | Required | Notes                                                                  |
| -------------- | -------- | ---------------------------------------------------------------------- |
| Parameter Name | Yes      | Default `api_key`. Common alternatives: `access_token`, `token`, `key` |
| API Key        | Yes      | Secret                                                                 |

Use for: APIs that authenticate via the URL query string.

## Basic Auth

Sends `Authorization: Basic <base64(username:password)>` on every request.

| Field    | Required | Notes                              |
| -------- | -------- | ---------------------------------- |
| Username | Yes      | Username or client ID              |
| Password | Yes      | Secret — password or client secret |

Use for: classic HTTP Basic Authentication, including many self-hosted services, and APIs that use an API key as the username or password.

---

::: tip Finding the right pattern
The service's API documentation "Authentication" section tells you which form to use. If it shows `curl -H "Authorization: Bearer ..."` → Bearer Token; `curl -H "X-Something: ..."` → header key; `?api_key=...` in example URLs → query parameter; `curl -u user:pass` → Basic Auth.
:::

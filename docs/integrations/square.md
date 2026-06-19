# Square

Lets agents manage **payments, orders, customers, and catalog items** through the Square API. Authenticates with an access token, sent as a Bearer token alongside a dated `Square-Version` header.

[Square API documentation](https://developer.squareup.com/docs/build-basics/using-rest-api)

## What you need

| Field        | Required | Notes                                                                |
| ------------ | -------- | -------------------------------------------------------------------- |
| Access Token | Yes      | Secret — must match the chosen environment (production or sandbox)   |
| API Base URL | Yes      | Production `https://connect.squareup.com/v2`, or sandbox `https://connect.squareupsandbox.com/v2` |

## Getting your access token

1. Sign in to the [Square Developer Console](https://developer.squareup.com/apps) and open (or create) an application.
2. Under **Credentials**, pick the **Production** or **Sandbox** environment and copy that environment's **Access Token**.
3. In the credential form, paste the token and set **API Base URL** to match the same environment.

::: warning Match the token to the environment
A production token only works against the production base URL, and a sandbox token only against the sandbox base URL. Mixing them returns authentication errors. Live tokens can move real money — start in sandbox while building an agent.
:::

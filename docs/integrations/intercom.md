# Intercom

Lets agents manage **contacts, conversations, and companies** in Intercom. Authenticates with an access token from a private Intercom app, sent as a Bearer token.

[Intercom REST API documentation](https://developers.intercom.com/docs/build-an-integration/learn-more/rest-apis/make-an-api-call)

## What you need

| Field        | Required | Notes                                                                          |
| ------------ | -------- | ------------------------------------------------------------------------------ |
| Access Token | Yes      | Secret                                                                         |
| API Base URL | Yes      | Region host. US `https://api.intercom.io`, EU `https://api.eu.intercom.io`, AU `https://api.au.intercom.io` |

## Getting your access token

1. Open the [Intercom Developer Hub](https://app.intercom.com/a/apps/_/developer-hub) and select (or create) your app.
2. Go to **Configure → Authentication**.
3. Copy the **Access Token** into the credential form.
4. Set **API Base URL** to match your workspace's region (US, EU, or AU). The default works for most US workspaces.

::: tip Region matters
Intercom partitions data by region. If requests fail with authentication errors despite a valid token, confirm the **API Base URL** matches the region your workspace lives in.
:::

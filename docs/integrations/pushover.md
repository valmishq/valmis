# Pushover

Lets agents send push notifications to your iOS, Android, and desktop devices — useful as a "notify me" tool in workflows. Requires two keys: an application token and your user key.

[Pushover API documentation](https://pushover.net/api)

## What you need

| Field                       | Required | Notes                                            |
| --------------------------- | -------- | ------------------------------------------------ |
| API Key (Application Token) | Yes      | Secret — 30 characters, begins with a letter     |
| User Key                    | Yes      | Secret — your user (or group) key, 30 characters |

## Getting your keys

**Application token:**

1. Sign in at [pushover.net](https://pushover.net/) and go to [Create an Application](https://pushover.net/apps/build).
2. Name the application (e.g. "Agent-Int") and register it.
3. Copy the **API Token/Key** shown on the application page.

**User key:**

1. On your [Pushover dashboard](https://pushover.net/), your **User Key** is shown at the top right.
2. To notify a delivery group instead, use the group key.

Enter both into the credential form — the application token identifies _what_ is sending, the user key identifies _who_ receives.

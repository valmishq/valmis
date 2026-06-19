# WordPress

Lets agents manage **posts, pages, media, and comments** on a self-hosted WordPress site via its REST API. Authenticates with your WordPress username and an Application Password, sent as HTTP Basic Auth.

[WordPress REST API authentication documentation](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/)

## What you need

| Field                | Required | Notes                                                |
| -------------------- | -------- | ---------------------------------------------------- |
| Username             | Yes      | Your WordPress login name (not the app-password label) |
| Application Password | Yes      | Secret — generated per-integration, revocable        |
| Site URL             | Yes      | Full base URL, e.g. `https://example.com` (HTTPS, no trailing slash) |

## Getting an Application Password

1. In wp-admin, open **Users → Profile** and scroll to **Application Passwords**.
2. Enter a name (e.g. "Valmis agent") and click **Add New Application Password**.
3. Copy the generated password — it is shown only once.
4. In the credential form, enter your **Username** (your normal WordPress login), paste the **Application Password**, and set your **Site URL**.

::: warning Application Passwords need HTTPS
WordPress only enables Application Passwords on sites served over HTTPS. Some hosts also strip the `Authorization` header — if the test fails, check your server/host configuration.
:::

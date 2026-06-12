# SEMrush

Lets agents query SEO and competitive-analysis data from the SEMrush API. The key is appended as a query parameter (`?key=...`) on every request.

[SEMrush API documentation](https://developer.semrush.com/api/basics/get-started/)

## What you need

| Field   | Required | Notes  |
| ------- | -------- | ------ |
| API Key | Yes      | Secret |

## Getting your API key

1. Sign in to SEMrush — API access requires a subscription with the API option enabled.
2. Go to [Subscription info](https://www.semrush.com/accounts/profile/subscription-info/) and open the **API** tab.
3. Copy your API key into the credential form.

::: warning API units
SEMrush bills API calls in "API units" tied to your subscription. An agent making frequent queries consumes units quickly — monitor your usage.
:::

# SerpApi

Lets agents fetch live search-engine results (Google, Bing, YouTube, and more) as structured data. The key is appended as a query parameter (`?api_key=...`) on every request.

[SerpApi documentation](https://serpapi.com/search-api)

## What you need

| Field   | Required | Notes                     |
| ------- | -------- | ------------------------- |
| API Key | Yes      | Secret — your private key |

## Getting your API key

1. Create an account at [serpapi.com](https://serpapi.com/) (a free plan with a monthly search quota is available).
2. Open [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key) — your private key is under the **Your Account** tab.
3. Copy it into the credential form.

::: tip Quota-free account checks
SerpApi's Account API endpoint is free and does not count toward your monthly search quota — credential tests don't consume searches.
:::

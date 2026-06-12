# Google Maps

Lets agents use the Google Maps Platform APIs — Geocoding, Directions, Places, Distance Matrix, and more. The API key is appended as the `key` query parameter on every request.

[Google Maps Platform documentation](https://developers.google.com/maps/documentation)

## What you need

| Field   | Required | Notes  |
| ------- | -------- | ------ |
| API Key | Yes      | Secret |

## Getting your API key

1. Open [console.cloud.google.com/google/maps-apis/credentials](https://console.cloud.google.com/google/maps-apis/credentials) (Google Cloud Console → Google Maps Platform → Credentials).
2. Create an API key for your project.
3. In the project's Maps Platform settings, **enable the specific APIs** the agent needs — Geocoding API, Directions API, Places API, etc. Calls to non-enabled APIs fail.
4. Copy the key into the credential form.

::: tip Restrict the key
Restrict the key to your server's IP address (API restrictions → application restrictions) and to the specific Maps APIs you enabled. Maps Platform is billed per request, so an unrestricted leaked key has direct cost impact.
:::

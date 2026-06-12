# OpenWeatherMap

Gives agents current weather, forecasts, and air-quality data. The API key is passed as a query parameter on every request.

[OpenWeatherMap API documentation](https://openweathermap.org/api)

## What you need

| Field   | Required | Notes                      |
| ------- | -------- | -------------------------- |
| API Key | Yes      | Secret — free or paid plan |

## Getting your API key

1. Create an account at [openweathermap.org](https://openweathermap.org/) (the free tier covers current weather and forecasts).
2. Open [home.openweathermap.org/api_keys](https://home.openweathermap.org/api_keys).
3. Copy the default key, or generate a named one, into the credential form.

::: warning New keys take time to activate
A freshly created OpenWeatherMap key can take **up to 2 hours** to activate. If the first requests return 401, wait and retry before debugging anything else.
:::

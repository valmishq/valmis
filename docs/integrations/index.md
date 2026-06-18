# Integrations

Valmis ships with ready-made credential definitions for the services below. Each page explains what the integration does, which credentials it needs, and **exactly where to find them** on the service's website.

To use any of them: **Credentials → Add credential**, pick the service, fill in the fields, then attach the credential to an agent. See the [credentials guide](/guide/credentials) for concepts like testing, OAuth2 authorization, and revocation.

::: tip OAuth2 redirect URI
Every OAuth2 integration requires registering the same redirect URI in the provider's console: `<APP_URL>/oauth2/callback`. The credential form shows it with a copy button.
:::

## App triggers

Some integrations can also **start a [workflow](/guide/workflows/)** when something happens in the app — a new email, a database change, a form response, a chat message. See [App Triggers](/integrations/triggers/) for the full list, or jump to one:

| Trigger                                             | Fires on                         | Delivery |
| --------------------------------------------------- | -------------------------------- | -------- |
| [Gmail](/integrations/triggers/gmail)               | New email received               | Push     |
| [Google Forms](/integrations/triggers/google-forms) | New form response                | Polling  |
| [Notion](/integrations/triggers/notion)             | Database item created or updated | Push     |
| [Slack](/integrations/triggers/slack)               | New message                      | Push     |

## Communication & bots

| Service                                              | Auth method          |
| ---------------------------------------------------- | -------------------- |
| [Discord Bot](/integrations/discord-bot)             | Bot token            |
| [Gmail](/integrations/google)                        | OAuth2 (Google)      |
| [Microsoft Outlook](/integrations/microsoft-outlook) | OAuth2 (Azure AD)    |
| [Pushover](/integrations/pushover)                   | API token + user key |
| [Slack](/integrations/slack)                         | OAuth2               |
| [Telegram Bot](/integrations/telegram-bot)           | Bot token            |

## Productivity & docs

| Service                                                | Auth method                     |
| ------------------------------------------------------ | ------------------------------- |
| [Airtable](/integrations/airtable)                     | Personal access token or OAuth2 |
| [Asana](/integrations/asana)                           | Personal access token           |
| [Cal.com](/integrations/cal-com)                       | API key                         |
| [Calendly](/integrations/calendly)                     | Personal access token           |
| [Canva](/integrations/canva)                           | OAuth2                          |
| [Dropbox](/integrations/dropbox)                       | Access token                    |
| [Google Calendar](/integrations/google)                | OAuth2 (Google)                 |
| [Google Docs](/integrations/google)                    | OAuth2 (Google)                 |
| [Google Drive](/integrations/google)                   | OAuth2 (Google, custom scopes)  |
| [Google Forms](/integrations/google)                   | OAuth2 (Google)                 |
| [Google Sheets](/integrations/google)                  | OAuth2 (Google)                 |
| [Google Workspace](/integrations/google)               | OAuth2 (Google, custom scopes)  |
| [Microsoft OneDrive](/integrations/microsoft-onedrive) | OAuth2 (Azure AD)               |
| [Jira](/integrations/jira)                             | Email + API token               |
| [Notion](/integrations/notion)                         | Integration token or OAuth2     |
| [Tally](/integrations/tally)                           | API key                         |
| [Trello](/integrations/trello)                         | API key + token                 |

## Business & commerce

| Service                          | Auth method             |
| -------------------------------- | ----------------------- |
| [HubSpot](/integrations/hubspot) | Service key or OAuth2   |
| [Shopify](/integrations/shopify) | Custom app access token |
| [Stripe](/integrations/stripe)   | Secret key              |

## Developer & data

| Service                                      | Auth method                    |
| -------------------------------------------- | ------------------------------ |
| [Alpha Vantage](/integrations/alpha-vantage) | API key                        |
| [Cloudflare](/integrations/cloudflare)       | API token                      |
| [GitHub](/integrations/github)               | Personal access token          |
| [Google Maps](/integrations/google-maps)     | API key                        |
| [Pinecone](/integrations/pinecone)           | API key                        |
| [SEMrush](/integrations/semrush)             | API key                        |
| [SerpApi](/integrations/serpapi)             | API key                        |
| [Supabase](/integrations/supabase)           | Project URL + service role key |

## Social & web

| Service                                        | Auth method |
| ---------------------------------------------- | ----------- |
| [Buffer](/integrations/buffer)                 | API key     |
| [OpenWeatherMap](/integrations/openweathermap) | API key     |
| [Reddit](/integrations/reddit)                 | OAuth2      |

## Smart home & generic

| Service                                        | Auth method                               |
| ---------------------------------------------- | ----------------------------------------- |
| [Home Assistant](/integrations/home-assistant) | Long-lived access token                   |
| [Generic HTTP Auth](/integrations/http)        | Basic / Bearer / header / query parameter |

## A service isn't listed?

Two options:

- Use the [generic HTTP credentials](/integrations/http) — most APIs accept a Bearer token, a custom header, or a query-parameter key.
- Integrations are defined as single YAML files in the source tree (`packages/utils/src/integrations/definitions/`); adding a new service requires no code changes. Contributions welcome.

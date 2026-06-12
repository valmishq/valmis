# API Keys

API keys give scripts and external tools programmatic access to your Agent-Int account — the same REST API the web UI uses — without a browser session. Manage them under **Account → API Keys**.

## Generating a key

1. Enter a **name** (e.g. "CI", "Home automation script").
2. Set **expires in (days)** — between 1 and 365.
3. Click **Generate**.

The raw key is displayed **once**, with a copy button. Store it in your secret manager immediately.

::: danger Shown only once
Agent-Int stores only a hash of the key (SHA-256). After you leave the page, the raw value cannot be retrieved — if you lose it, delete the key and generate a new one.
:::

## Using a key

Send the key as a Bearer token on requests to the API:

```bash
curl -H "Authorization: Bearer <your-api-key>" \
  https://your-agent-int.example.com/api/v1/agents
```

A key authenticates as **you** — it can do whatever your account can do.

## Managing keys

The list shows each key's name, a truncated identifier, an **Active**/**Expired** status badge, and the creation and expiry dates. Delete revokes a key immediately.

Rotate keys by generating a replacement, switching your scripts over, then deleting the old one.

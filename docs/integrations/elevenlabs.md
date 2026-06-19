# ElevenLabs

Lets agents use **ElevenLabs** for text-to-speech and voice AI — **generate audio, browse voices, and check usage**. Authenticates with an API key sent in the `xi-api-key` header.

[ElevenLabs API authentication documentation](https://elevenlabs.io/docs/api-reference/authentication)

## What you need

| Field   | Required | Notes  |
| ------- | -------- | ------ |
| API Key | Yes      | Secret |

## Getting your API key

1. Sign in to [elevenlabs.io](https://elevenlabs.io/) and open your **profile menu → API Keys** (or **Settings → API Keys**).
2. Create a key, optionally restrict its permissions, and copy the value into the credential form — it is shown only once.

::: info Audio is returned as a file
Text-to-speech requests return audio bytes. When asked to generate speech, the agent can save the result to its workspace (e.g. an `.mp3`) using its file tools, then reference or share it.
:::

::: tip Character quota
Speech generation consumes characters from your ElevenLabs plan. Ask the agent to check usage (the connection test reads your account) before large jobs.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "List the voices available on my ElevenLabs account."
- "Generate speech for this paragraph using the 'Rachel' voice and save it as intro.mp3."
- "How many characters do I have left this month?"

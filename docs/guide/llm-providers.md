# LLM Providers

LLM provider configs are stored API keys plus a model selection. Agents reference these configs — they never hold keys themselves. Manage them under **LLM Providers** in the sidebar.

## Adding a provider config

Click to add a configuration and fill in:

| Field               | Description                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Provider**        | One of 20 supported providers (OpenAI, Anthropic, Google, Mistral, Cohere, and more) or a custom/self-hosted endpoint.                             |
| **Name**            | A label for this config, e.g. "GPT-4o production key".                                                                                             |
| **Model**           | Picked from a built-in catalog of 175 models. The picker shows context window sizes; pricing from the catalog drives the platform's cost tracking. |
| **API key**         | Encrypted (AES-256-GCM) before storage. When editing, leave the field blank to keep the current key.                                               |
| **Base URL**        | Required for custom/self-hosted providers; optional override for others. Any OpenAI-compatible endpoint works (e.g. a local inference server).     |
| **Embedding model** | Check this to mark the config as an embedding model instead of a chat model.                                                                       |
| **Set as default**  | Chat models only — marks this config as the default.                                                                                               |

## Chat models vs embedding models

A config is either a **chat model** (what agents converse and reason with) or an **embedding model** (used to embed [agent memory](/guide/memory) entries for semantic search). They are listed in separate sections.

An agent needs one chat model, and optionally one embedding model. Supported embedding providers: OpenAI, Google, Mistral, Cohere, and any OpenAI-compatible endpoint.

## How keys are used

When an agent runs, the sandbox never receives the API key. Each LLM call is proxied through the server, which decrypts the key just-in-time, streams the provider's response back to the sandbox and to your browser simultaneously, and records token usage and cost per message.

## Managing configs

The list shows each config's name, provider, model, and creation date, with badges for default and embedding status. You can edit, delete, or promote a config to default at any time. Deleting a config that agents reference will leave those agents without a model — reassign them first.

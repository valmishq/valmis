# What is Agent-Int?

Agent-Int is a **self-hosted AI agent platform**. You install it on your own server, connect it to the LLM providers you already have API keys for, and build agents that can:

- **Chat with you** in a real-time streaming web UI — or from your phone via [Telegram and Discord](/guide/channels)
- **Call external services** (Slack, GitHub, Gmail, Notion, Stripe, Home Assistant, and [many more](/integrations/)) using credentials you store once
- **Remember things** across conversations with a built-in [vector memory](/guide/memory)
- **Work with files and run code** in an isolated, per-agent workspace
- **Run automatically** via [workflows](/guide/workflows/) triggered by cron schedules, webhooks, app events (a new email, a Notion change, a form submission), or manual runs
- **Ask you for input** mid-task and wait for your answer (human-in-the-loop)

Everything — LLM API keys, third-party credentials, conversation history, agent memory — lives in your own PostgreSQL database. Nothing is sent to a vendor cloud except the LLM and API calls you explicitly configure.

## How it works

```
            Browser / Telegram / Discord
                        │
                        ▼
              ┌───────────────────┐
              │  Agent-Int server  │   web UI + API + workflow engine
              │  (single container)│   credentials encrypted at rest
              └─────────┬─────────┘
                        │ spawns one sandbox per agent turn
                        ▼
              ┌───────────────────┐
              │   Agent sandbox    │   runs the agent loop and tools
              │  (no secrets here) │   LLM + API calls proxied back
              └───────────────────┘
                        │
                        ▼
              PostgreSQL (+ pgvector)
```

When you send a message to an agent, the server spawns a short-lived, isolated **sandbox** that runs the agent loop. The sandbox never receives your database connection, LLM API keys, or stored credentials — every sensitive operation is proxied back to the server, which resolves secrets just-in-time. See [Security Overview](/guide/security) for the full picture.

## Core concepts

| Concept                                 | What it is                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Agent](/guide/agents)                  | A configured AI assistant: name, system instruction, chat model, optional embedding model, credentials, and skills.                               |
| [LLM provider](/guide/llm-providers)    | A stored API key + model selection (e.g. your OpenAI or Anthropic key). Agents pick a chat model and optionally an embedding model from these.    |
| [Credential](/guide/credentials)        | An encrypted set of secrets for a third-party service (API key, OAuth2 tokens, …) that agents can use through the `call_api` tool.                |
| [Skill](/guide/skills)                  | A markdown-defined behavioral profile assigned to an agent. Install community skills from GitHub or use the built-ins.                            |
| [Knowledge base](/guide/knowledge-base) | A library of your documents (uploaded or imported from cloud storage), converted to searchable text and assigned to agents as reference material. |
| [Memory](/guide/memory)                 | A per-agent vector store with four memory types. The agent writes and searches it autonomously.                                                   |
| [Workflow](/guide/workflows/)            | A multi-step pipeline attached to an agent, where each step is a full agent turn. Triggered manually, by cron, by webhook, or by an app event.    |
| [Channel](/guide/channels)              | A pairing between an agent and your own Telegram or Discord bot, so you can talk to the agent outside the web UI.                                 |

## What Agent-Int is not

- **Not a hosted SaaS.** There is no cloud version; you run it yourself with Docker Compose or from source.
- **Not tied to one LLM vendor.** The model catalog covers 175 models across 20 providers, and any OpenAI-compatible endpoint (including self-hosted models) works via a custom base URL.
- **Not a no-code automation tool with hundreds of nodes.** Workflows are agent-native: each step is an LLM turn with tools, not a static node graph.

## Next steps

1. [Install with Docker Compose](/guide/installation) — the recommended path
2. [Getting Started](/guide/getting-started) — your first agent in ten minutes
3. [Browse integrations](/integrations/) — see what your agents can connect to

# Agents

An agent is a configured AI assistant: a model, a personality, and a set of capabilities. You can create as many agents as you like, each with its own credentials, skills, knowledge, memory, and workflows.

## Creating an agent

Go to **Agents → Create new agent**. The same form is used to edit an existing agent later.

### Basics

| Field                  | Description                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**               | Shown in lists, chat, and messaging channels.                                                                                                           |
| **Description**        | Optional, shown on the agent picker and list pages.                                                                                                     |
| **Avatar**             | An emoji from the preset picker (default 🤖).                                                                                                           |
| **System instruction** | Freeform text injected as the system prompt of every conversation turn. Define the agent's role, tone, constraints, and any standing instructions here. |

### Models

| Field               | Description                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Chat model**      | Which [LLM provider config](/guide/llm-providers) the agent thinks with.                                                                                                                                           |
| **Embedding model** | Optional second config used to embed [memory](/guide/memory) entries and [knowledge base](/guide/knowledge-base) files. Without it, the agent's memory tools are disabled and knowledge files cannot be processed. |

### Credentials

Select which stored [credentials](/guide/credentials) this agent may use. The agent calls them through the `call_api` tool — it sees each credential's name and service, but never the secret itself. An agent can only use credentials explicitly attached to it.

### Knowledge base

Attach documents from your [knowledge library](/guide/knowledge-base) for the agent to reference. Click **Add knowledge** to select existing library files, or upload / import from cloud storage (Google Drive, Dropbox, OneDrive) directly in the dialog. Selections apply when you save the agent.

After saving, each file is chunked and embedded into the agent's memory in the background — the card shows a per-file status (pending → processing → ready). The agent then retrieves relevant passages with `memory_search` during conversations and cites them by file name and location (e.g. "Page 3"). Requires an **embedding model** (above); see the [knowledge base guide](/guide/knowledge-base) for formats, limits, and how processing works.

Removing a file here deletes this agent's chunks for it but keeps the file in your library for other agents.

### Skills

Assign [skills](/guide/skills) — behavioral profiles the agent loads on demand. Built-in skills ship with the platform; more can be installed from GitHub.

### Allow internet access

When the platform runs agents in the Docker sandbox (the default for Docker Compose deployments), this toggle controls the sandbox's network egress:

- **On** — the sandbox has normal internet access; `run_terminal` and `run_code` can reach the network (e.g. `curl`, `pip install`).
- **Off** — the sandbox is placed on an internal-only network. It can still call APIs through attached credentials (`call_api` is proxied by the server), but direct network access from terminal or code execution is blocked.

Use **Off** for agents that handle sensitive data or run untrusted instructions.

## The agents list

**Agents** shows every agent with quick actions per row:

| Action        | Where it goes                                 |
| ------------- | --------------------------------------------- |
| **Workflows** | The agent's [workflow list](/guide/workflows) |
| **Activity**  | Run history and cost dashboard (below)        |
| **Memory**    | The [memory browser](/guide/memory)           |
| **Edit**      | The agent form                                |
| **Delete**    | Removes the agent (with confirmation)         |

## Activity and cost tracking

Each agent's **details page** shows an execution dashboard:

- Summary cards: **total cost (USD)**, **total tokens**, and currently **active runs**
- A run history table with status (running / completed / error), trigger type (chat, cron, webhook, manual), input + output token counts, cost, duration, and a relative timestamp

Costs are computed from the model catalog's per-token pricing for the model each turn actually used. The same numbers appear live in the [chat usage bar](/guide/chat#the-usage-bar).

## Execution limits

Two platform-wide guards apply to every agent run (configurable via [environment variables](/guide/configuration#agent-runtime)):

- A hard **40-minute** wall-clock limit per run
- A maximum of **20 concurrent runs** across all agents

Within a single turn, an agent may make at most **20 tool calls** — when it hits the cap it must stop and reply with text instead.

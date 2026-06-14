# Getting Started

This walkthrough takes you from a fresh installation to a working agent in about ten minutes. It assumes Agent-Int is already [installed and running](/guide/installation).

## 1. Create the admin account

Open your Agent-Int URL. On a fresh install you are redirected to the **setup page** — create the first admin account with an email and password, then sign in. Setup is a one-time step; the endpoint locks once any user exists.

## 2. Add an LLM provider

Agents need a model to think with. Go to **LLM Providers** in the sidebar and click to add a configuration:

1. Pick a **provider** — OpenAI, Anthropic, Google, or any of the 20 supported providers. Self-hosted or OpenAI-compatible endpoints work too via a custom base URL.
2. Give the config a **name** (e.g. "Claude production key").
3. Pick a **model** from the catalog. The picker shows each model's context window.
4. Paste your **API key**. It is encrypted before it touches the database.

Your first chat-model config becomes the practical default for new agents.

::: tip Add an embedding model too
If you want agents to have [long-term memory](/guide/memory), add a second config marked **embedding model** (e.g. an OpenAI `text-embedding` model). Memory is disabled for agents without one — everything else works fine.
:::

See [LLM Providers](/guide/llm-providers) for details.

## 3. Create an agent

Go to **Agents → Create new agent**:

- **Name** and optional description
- **Avatar** — pick an emoji
- **System instruction** — who the agent is and how it should behave. This is injected into every conversation turn.
- **Chat model** — one of your LLM provider configs
- **Embedding model** — optional; enables memory
- **Credentials** and **skills** — skip both for now; you can attach them later

Save the agent. See [Agents](/guide/agents) for every option, including the internet-access toggle for sandboxed deployments.

## 4. Have a conversation

Go to **Chat**, pick your agent, and start a thread. You'll see:

- The response **streaming** in token by token
- Collapsible **thinking** blocks when the model reasons before answering
- **Tool calls** rendered inline with their arguments and results
- A **usage bar** above the input tracking context fill and session cost

Try asking the agent to write a file, run some code, or — once you've added credentials — call a real API. See [Chat](/guide/chat).

## 5. Connect a service

To let the agent act on the outside world:

1. Go to **Credentials** and click **Add credential**.
2. Pick a service (say, [GitHub](/integrations/github)) and follow its page in the [integration docs](/integrations/) to find the key or token on the service's website.
3. **Test** the credential from the list to confirm it works.
4. Edit your agent and attach the credential.

Now ask the agent something like _"list my open GitHub pull requests"_ — it will call the API through the platform's credential proxy without ever seeing the raw token.

## Where to go next

| Goal                                          | Read                                  |
| --------------------------------------------- | ------------------------------------- |
| Let the agent remember preferences and facts  | [Agent Memory](/guide/memory)         |
| Run the agent on a schedule, webhook, or app event | [Workflows](/guide/workflows)    |
| Talk to the agent from Telegram or Discord    | [Messaging Channels](/guide/channels) |
| Give the agent specialized behaviors          | [Skills](/guide/skills)               |
| Automate against the platform API             | [API Keys](/guide/api-keys)           |
| Understand the isolation model                | [Security Overview](/guide/security)  |

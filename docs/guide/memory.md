# Agent Memory

Each agent has a private long-term memory: a vector store (PostgreSQL + pgvector) the agent writes to and searches semantically. Memory is how an agent recalls your preferences, facts it has learned, and rules it should follow — across threads and across weeks.

## Requirements

Memory needs an **embedding model** on the agent ([agent form → models](/guide/agents#models)). Configure one under [LLM Providers](/guide/llm-providers) — supported embedding providers are OpenAI, Google, Mistral, Cohere, and any OpenAI-compatible endpoint. Without an embedding model, the agent's memory tools are disabled and everything else works normally.

Embeddings are generated server-side; the agent sandbox only sends the text.

## Memory types

Entries are classified into four types, modeled on cognitive memory research:

| Type           | What it holds                                | Example                                                               |
| -------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| **Episodic**   | Records of specific events and task outcomes | "On June 3rd, the deploy to staging failed due to a missing env var." |
| **Semantic**   | Distilled facts and domain knowledge         | "The user's company ships on Thursdays."                              |
| **Procedural** | Behavioral rules and operating constraints   | "Always answer in German."                                            |
| **Working**    | Short-lived context for the current thread   | Intermediate task state                                               |

## How memories get written

**The agent writes memory itself.** Agents with memory enabled are instructed to save entries immediately when you share a preference, a personal fact, a correction, or domain knowledge — and _not_ to log routine execution steps. You can also just tell the agent to remember something.

### Automatic summarization

When you start a new thread, the platform reviews the previous thread in the background and extracts anything worth keeping into memory. Extraction is deduplication-aware — it searches existing memory first and only stores genuinely new information. This runs silently and never blocks your conversation.

## How memories get used

During conversations the agent calls `memory_search` to retrieve relevant entries by meaning (semantic similarity), not keywords — asking about "vacation plans" can recall an entry about "trip to Lisbon in July". The agent can also prune outdated entries with `memory_delete`.

## Managing memory in the UI

Each agent has a memory page (**Agents → memory icon**, or the **Memory** button on the agent form) showing:

- The total entry count
- Every entry with its content, a color-coded type badge, and its creation time
- A per-entry **delete** button

Use it to audit what an agent knows and remove anything wrong or unwanted. Memory is per-agent: deleting an agent deletes its memory, and no agent can read another agent's memory.

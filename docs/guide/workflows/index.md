# Workflows

A workflow turns an agent into an automation: a **trigger** that fires it, and a **graph** of nodes it runs each time. Each agent node is a full agent turn — its own instruction, tools, and credentials — and nodes can branch on conditions and repeat in loops. Every firing is recorded as a **run** with a live, per-step timeline.

You build workflows on a visual canvas: drag nodes, connect them, and configure each in a side panel. Workflows belong to an agent — manage them from **Agents → workflow icon**, or see every agent's workflows on the global **Workflows** page.

## The pieces

| Node | What it does |
| ---- | ------------ |
| **Trigger** | How the workflow starts — manual, cron, webhook, or an app event. Exactly one per workflow. |
| **Agent step** | One full agent turn, with its own instruction, allowed tools, and credentials. |
| **Condition** | Branches the flow down a **true** or **false** path. |
| **Loop** | Repeats a set of nodes — over a list (_for each_) or until a check stops holding (_while_). |

Nodes pass data forward: every node's result is available to the ones after it, and the trigger's payload is available throughout. See [Data flow & variables](/guide/workflows/data-flow).

## Enabling and running

Each workflow has an **enabled** toggle on the Workflows list — a disabled workflow can't be triggered. Every time a trigger fires, a **run** is created and executes node by node; watch it live or browse past runs from **View runs**. See [Runs & observability](/guide/workflows/runs).

Agents can also describe, create, and start their own workflows straight from chat — see [Managing workflows from chat](/guide/workflows/agent-chat).

## Read next

- **[The visual builder](/guide/workflows/builder)** — add, connect, and configure nodes on the canvas.
- **[Triggers](/guide/workflows/triggers)** — manual, cron, webhook, and app-event triggers.
- **[Agent steps](/guide/workflows/steps)** — instruction, tools, credentials, output schema, error handling.
- **[Conditions](/guide/workflows/conditions)** — branch on a smart (agent-judged) or manual (rule-based) check.
- **[Loops](/guide/workflows/loops)** — repeat over a list or while a condition holds.
- **[Data flow & variables](/guide/workflows/data-flow)** — how nodes reference the trigger and earlier results.
- **[Runs & observability](/guide/workflows/runs)** — run history and the live step timeline.
- **[Managing workflows from chat](/guide/workflows/agent-chat)** — the agent's workflow tools.

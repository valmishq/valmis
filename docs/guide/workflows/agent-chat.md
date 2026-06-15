# Managing workflows from chat

An agent can manage its **own** workflows during a normal chat, through its [workflow tools](/guide/tools#workflows). You build and run automations just by describing them.

## Discovering

- **`list_workflows`** — lists the agent's enabled workflows with a one-line composition (steps, conditions, loops) and trigger kind.
- **`read_workflow`** — describes one workflow in full: its trigger and its node graph (each step's instruction and limits, each condition's branches, each loop's body) and how the nodes connect.

## Creating

**`create_workflow`** builds a new workflow. The agent can define the flow two ways:

- a simple **linear** list of steps ("do A, then B, then C"), or
- a **graph** with **conditions** and **loops** when the automation needs to branch or repeat.

Conditions and while-loops it creates default to **smart** mode — the check is written in plain language. The trigger can be **manual**, **cron**, or **webhook**.

::: warning Creation is gated
Before creating anything, the agent must present the full proposed configuration and get your **explicit confirmation** through a human-in-the-loop prompt. You see exactly what will be built — name, trigger, and every step — and approve it first.
:::

After creating, the agent's reply includes links to view and edit the new workflow.

## Triggering

**`trigger_workflow`** starts an enabled workflow immediately — this is how a [manual](/guide/workflows/triggers#manual) workflow is run on demand. It's **fire-and-forget**: the run executes in the background and the tool returns a link to it rather than waiting for it to finish. An optional **payload** is passed through as <code v-pre>{{trigger.payload}}</code>, just like a webhook body.

## Example

> **You:** Every weekday at 8am, check my unread emails and post a summary to Slack.
>
> **Agent:** Here's the workflow I'll create — **Weekday Email Digest**, cron `0 8 * * 1-5`, two steps (fetch unread mail → summarize and post to Slack). Shall I create it?
>
> **You:** Yes.
>
> **Agent:** Created **Weekday Email Digest**. View it here: … _(link)_

Running an existing one on demand:

> **You:** Run the email digest now.
>
> **Agent:** Started a run — watch it here: … _(link)_

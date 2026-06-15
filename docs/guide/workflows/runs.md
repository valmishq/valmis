# Runs & observability

Each time a trigger fires, the workflow creates a **run** and executes it node by node. You can watch a run live or browse past ones.

## Run history

From the Workflows list, the activity icon (**View runs**) opens a workflow's run history — a table of every run with its trigger type, status (running / completed / error), start time, and duration.

## Run detail

Click a run to open its detail view: the trigger, overall status, a duration that ticks in real time while it's running, and a **step-by-step timeline**. Each step row shows its status, duration, and an expandable **input** and **output**. While the run is in progress, the page polls every few seconds, so the timeline fills in as steps complete.

A step finishes as **success**, **failed** (subject to its [error handling](/guide/workflows/steps#error-handling)), or **skipped** (when an earlier failure stopped the run).

## Full transcripts

Workflow runs execute in regular conversation threads, hidden behind the **workflow filter** in the [chat sidebar](/guide/chat#thread-management) — turn it on to read a run's complete transcript, including every tool call inside each step. (The per-step **output** in the run detail shows results only.)

Run tokens and cost roll up into the agent's [activity dashboard](/guide/agents#activity-and-cost-tracking).

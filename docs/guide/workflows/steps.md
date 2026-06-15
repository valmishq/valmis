# Agent steps

An agent step is one full agent turn: the agent reads its instruction (plus the data flowing in), uses its tools, and produces a result the following nodes can use. Click an agent node to configure it.

## Settings

| Setting | Description |
| ------- | ----------- |
| **Step name** | A short label, shown on the node and in run logs. |
| **Instruction** | What the agent should do in this step — its prompt. Supports [template variables](/guide/workflows/data-flow). |
| **Input mapping** _(optional)_ | A template controlling exactly what data this step receives. Leave it empty to get the automatic context (all earlier results + the trigger). See [Data flow](/guide/workflows/data-flow). |
| **Allowed tools** | Restrict which [built-in tools](/guide/tools) this step may use. Leave all unchecked to allow every tool. |
| **Allowed credentials** | Restrict which of the agent's [credentials](/guide/credentials) this step may use. Leave all unchecked to allow all of them. |
| **Max tool calls per step** | Cap on tool calls within the step (1–100, default 20). |
| **Expected response schema** _(optional)_ | A JSON Schema the step's output must match. When set, the agent must reply with valid JSON conforming to it. |
| **Error handling** | What to do if the step fails (see below). |

## Output schema

By default a step's result is free text — referenced as <code v-pre>{{steps.&lt;nodeId&gt;.output.text}}</code>. Provide an **Expected response schema** when a later node needs specific fields: the step then returns a JSON object you can address by field, e.g. <code v-pre>{{steps.&lt;nodeId&gt;.output.total}}</code>.

A schema also keeps results small, which matters because later steps receive earlier results as context — see [Data flow](/guide/workflows/data-flow).

## Error handling

Choose what happens if the step fails:

| Action | Behavior |
| ------ | -------- |
| **Stop workflow** | Halt the run (the default). Remaining nodes are marked skipped. |
| **Continue to next step** | Record the error and carry on. |
| **Retry** | Retry the step up to **Max retries** (1–10). If it still fails, apply the **After retries exhausted** fallback — **Stop workflow** or **Continue to next step**. |

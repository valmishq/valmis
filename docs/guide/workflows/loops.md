# Loops

A loop repeats a set of nodes. The **body** output runs the sub-flow once per iteration; the **done** output runs after the loop finishes. The last node in the body connects **back** into the loop. Click a loop node to configure it.

Give it a **Name** and pick a **Loop type**.

## For each item

The default. **Items** is a template that resolves to a JSON array; the loop runs the body once per element.

```
{{steps.<nodeId>.output.items}}
```

Inside the body, reference the current element and position with:

| Variable | Value |
| -------- | ----- |
| <code v-pre>{{loop.item}}</code> | The current array element. Drill in with dot paths, e.g. <code v-pre>{{loop.item.email}}</code>. |
| <code v-pre>{{loop.index}}</code> | The current index, starting at 0. |

## While condition

Repeats while a check keeps holding, re-evaluated each iteration. Choose how it's judged under **Continue while**:

- **Smart — the agent decides** — describe in plain language when to keep going (e.g. _the list still has fewer than 3 items_); each iteration the agent reads the latest body output and decides.
- **Manual — field rules** — the same rule builder as [conditions](/guide/workflows/conditions#manual-mode).

## Max iterations

Every loop has a **Max iterations** safety cap (1–1000, default 10) to prevent runaway loops — the loop stops at the cap even if its condition would continue.

A loop's result records how many iterations ran and each iteration's output, so a later node can read <code v-pre>{{steps.&lt;nodeId&gt;.output.results}}</code>. See [Data flow](/guide/workflows/data-flow).

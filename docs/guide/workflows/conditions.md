# Conditions

A condition node splits the flow in two: when its check is **true** the flow follows the **true** output, otherwise the **false** output. Wire each output to a different node — leave one unconnected to end that branch. Click a condition node to configure it.

Give it a **Name**, then pick a **Decision mode**.

## Smart mode

The default — **the agent decides**. Write the check in **plain language**; the agent reads the results of the earlier nodes and decides true or false.

> the share price is above 1000

You don't have to spell out where the data lives — the agent already sees the prior nodes' results. Reference a specific value with <code v-pre>{{steps.&lt;nodeId&gt;.output.field}}</code> if you want to be precise. A smart condition records its decision together with a one-line reason (see its result under [Data flow](/guide/workflows/data-flow)).

## Manual mode

**Field rules**, evaluated without the model. Build one or more rows of **field · operator · value**; with more than one row, choose whether **ALL (and)** or **ANY (or)** must match.

The **field** (and, for binary operators, the **value**) can be a literal or a template like <code v-pre>{{steps.&lt;nodeId&gt;.output.status}}</code>.

| Operator | Meaning | Needs a value |
| -------- | ------- | :-----------: |
| equals | equal | yes |
| not equals | not equal | yes |
| contains | substring / item present | yes |
| does not contain | substring / item absent | yes |
| `>` (greater than) | greater than | yes |
| `≥` (greater or equal) | greater than or equal | yes |
| `<` (less than) | less than | yes |
| `≤` (less or equal) | less than or equal | yes |
| is empty | empty string or no value | no |
| is not empty | has a value | no |
| is true | truthy | no |
| is false | falsy | no |
| exists | the path resolves | no |
| does not exist | the path is missing | no |

::: tip Smart vs manual
Use **manual** when the check is a clean comparison on a known field (a status equals `paid`, a count `≥ 10`) — it's deterministic and free. Use **smart** when the judgment needs reading or interpreting text (sentiment, relevance, "does this look urgent") — it costs one short model call.
:::

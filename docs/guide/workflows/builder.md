# The visual builder

Workflows are built on a drag-and-drop canvas. Open it from **Workflows → New workflow** (pick the agent that owns it), or **Edit** an existing workflow. This page tours the canvas; each node type has its own page for the details.

## Name your workflow

Above the canvas, give the workflow a **Name** (required) and an optional **Description**. The name is also used as the trigger's name.

## The canvas

A new workflow starts with a single **Trigger** node. You add **Agent step**, **Condition**, and **Loop** nodes and wire them into a flow that runs left to right.

### Add nodes

The **Add node** palette sits in the top-left corner with three items:

| Palette item | Adds |
| ------------ | ---- |
| **Agent Step** | A full agent turn. |
| **Condition** | A true/false branch. |
| **Loop** | A repeat over items, or while a check holds. |

**Drag** an item onto the canvas to drop it where you release, or **click** it to drop the node next to the last one. A new agent step starts untitled — open it to configure.

### Connect nodes

Every node has handles on its sides. Drag from a node's **right (output)** handle to the next node's **left (input)** handle to connect them. Some nodes have more than one output:

- A **Condition** has two outputs — **true** and **false**. Wire each to a different downstream node; leave one unconnected to end that branch.
- A **Loop** has a **body** output (the sub-flow it repeats) and a **done** output (what runs after it finishes); the last node of the body connects **back** into the loop.

Self-connections and duplicate edges are rejected.

### Configure a node

**Click any node** to open its configuration in a right-side drawer. The fields depend on the node type (see the per-node pages). Two things every editable node shows:

- An **Output ref** box at the top with a **Copy** button — it copies this node's <code v-pre>{{steps.&lt;nodeId&gt;.output}}</code> reference so you can paste it into a later node. See [Data flow & variables](/guide/workflows/data-flow).
- **Cancel** and **Save** buttons in the footer.

::: tip Edits aren't applied until you click Save
The drawer edits a **draft**. **Save** applies your changes to the node; **Cancel** — or closing the drawer with Esc, the X, or a click outside — discards them. This is separate from saving the whole workflow (below).
:::

### Arrange and clean up

- **Tidy up** (top-right) auto-arranges the graph left-to-right and fits it in view.
- The **mini-map** and **zoom controls** (bottom corners) help you navigate large flows.
- Select a node or edge and press **Delete** or **Backspace** to remove it. The trigger node can't be deleted.

## Save the workflow

Below the canvas, the builder lists any **validation problems** in real time and blocks saving until they're fixed:

- the workflow needs a **name** and **at least one agent step**;
- every step needs a **name** and an **instruction**;
- a cron trigger needs a **schedule**; an app trigger needs its app, event, credential, and every required parameter.

When it's valid, click **Create workflow** (or **Save changes** when editing). On success you stay in the builder with a confirmation — and for webhook and push app triggers, the trigger card then reveals the generated URL to register. See [Triggers](/guide/workflows/triggers).

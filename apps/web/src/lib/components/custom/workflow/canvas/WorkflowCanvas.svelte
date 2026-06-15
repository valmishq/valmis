<script lang="ts">
	import {
		SvelteFlow,
		Background,
		Controls,
		MiniMap,
		Panel,
		useSvelteFlow,
		type Node,
		type Edge,
		type Connection,
		type NodeTypes
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import { Graph, layout } from '@dagrejs/dagre';
	import { DRAG_MIME, newFlowNode, edgeVisual } from '$lib/workflow/graph';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { WorkflowNodeType } from '@repo/types';
	import TriggerNode from './TriggerNode.svelte';
	import AgentStepNode from './AgentStepNode.svelte';
	import ConditionNode from './ConditionNode.svelte';
	import LoopNode from './LoopNode.svelte';
	import NodePalette from './NodePalette.svelte';
	import WandIcon from '@lucide/svelte/icons/wand-sparkles';

	interface Props {
		nodes: Node[];
		edges: Edge[];
		colorMode: 'light' | 'dark';
		/** Fired when a node is clicked (open its config), or null when the pane is clicked. */
		onSelect: (nodeId: string | null) => void;
	}

	let { nodes = $bindable(), edges = $bindable(), colorMode, onSelect }: Props = $props();

	const nodeTypes: NodeTypes = {
		trigger: TriggerNode,
		agent: AgentStepNode,
		condition: ConditionNode,
		loop: LoopNode
	};

	const { screenToFlowPosition, fitView, setCenter, getViewport } = useSvelteFlow();

	// Approx node footprint used for auto-layout spacing.
	const NODE_W = 224;
	const NODE_H = 96;
	/** Horizontal gap when placing a new node next to the previous one. */
	const NODE_GAP = 300;
	/**
	 * Upper bound on the zoom used by the initial fit and "Tidy up". `fitView`
	 * scales the graph to fill the viewport, so a sparse graph (e.g. a new
	 * trigger + one step) would otherwise be blown up to full size. Capping the
	 * zoom keeps those nodes at a comfortable size; a dense graph fits below this
	 * cap on its own, so it's unaffected — the cap only bites when there's spare
	 * room. This does NOT limit manual zooming (that's the flow's own maxZoom).
	 */
	const FIT_MAX_ZOOM = 0.75;

	/** Auto-layout the graph left-to-right with dagre, then fit the view. */
	function tidyUp() {
		const g = new Graph();
		g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 120, marginx: 24, marginy: 24 });
		g.setDefaultEdgeLabel(() => ({}));
		for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
		for (const e of edges) {
			// Skip loop back-edges so the cycle doesn't distort the layered layout.
			if (e.targetHandle === 'loopBack') continue;
			g.setEdge(e.source, e.target);
		}
		layout(g);
		nodes = nodes.map((n) => {
			const p = g.node(n.id);
			return p ? { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } } : n;
		});
		void fitView({ maxZoom: FIT_MAX_ZOOM, duration: 300 });
	}

	/** Create a new node of the given type at a flow-space position and select it. */
	function createNode(type: WorkflowNodeType, position: { x: number; y: number }, reveal = false) {
		const node = newFlowNode(type, position);
		if (!node) return;
		nodes = [...nodes, node];
		onSelect(node.id);
		if (reveal) {
			const { zoom } = getViewport();
			void setCenter(position.x + NODE_W / 2, position.y + NODE_H / 2, { zoom, duration: 300 });
		}
	}

	/** Position for a palette-added node: just right of the right-most existing node. */
	function nextNodePosition(): { x: number; y: number } {
		if (nodes.length === 0) return { x: 60, y: 80 };
		let anchor = nodes[0];
		for (const n of nodes) if (n.position.x > anchor.position.x) anchor = n;
		return { x: anchor.position.x + NODE_GAP, y: anchor.position.y };
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		const type = event.dataTransfer?.getData(DRAG_MIME) as WorkflowNodeType | undefined;
		if (!type) return;
		const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
		createNode(type, position);
	}

	/** Palette click: place the node next to the previous one and bring it into view. */
	function addNodeAtDefault(type: WorkflowNodeType) {
		createNode(type, nextNodePosition(), true);
	}

	/** Block self-connections and duplicate edges; everything else is allowed. */
	function isValidConnection(connection: Connection | Edge): boolean {
		if (connection.source === connection.target) return false;
		return !edges.some(
			(e) =>
				e.source === connection.source &&
				e.target === connection.target &&
				(e.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
				(e.targetHandle ?? null) === (connection.targetHandle ?? null)
		);
	}

	/** A connection is auto-added by Svelte Flow; label branch/loop edges afterwards. */
	function onConnect() {
		edges = edges.map((e) => {
			const v = edgeVisual(
				e.sourceHandle,
				e.targetHandle,
				typeof e.label === 'string' ? e.label : undefined
			);
			return { ...e, type: v.type, label: v.label };
		});
	}
</script>

<!-- The wrapper carries the drop handlers so we don't depend on SvelteFlow forwarding
     DOM events; screenToFlowPosition works from screen coords regardless. -->
<div
	class="size-full"
	role="application"
	aria-label="Workflow canvas"
	ondragover={handleDragOver}
	ondrop={handleDrop}
>
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		{colorMode}
		{isValidConnection}
		fitView
		fitViewOptions={{ padding: 0.25, maxZoom: FIT_MAX_ZOOM }}
		defaultEdgeOptions={{ type: 'smoothstep' }}
		deleteKey={['Backspace', 'Delete']}
		onnodeclick={({ node }) => onSelect(node.id)}
		onpaneclick={() => onSelect(null)}
		onconnect={onConnect}
	>
		<Background />
		<Controls />
		<MiniMap pannable zoomable />
		<Panel position="top-left">
			<NodePalette onAdd={addNodeAtDefault} />
		</Panel>
		<Panel position="top-right">
			<Button
				type="button"
				variant="outline"
				size="sm"
				onclick={tidyUp}
				class="gap-1.5 bg-card/95 shadow-md backdrop-blur"
			>
				<WandIcon class="size-3.5" />
				Tidy up
			</Button>
		</Panel>
	</SvelteFlow>
</div>

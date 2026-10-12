'use client';
import { memo, useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, MarkerType, useNodesState, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { Box, Braces, FileCode2, GitBranch, ArrowUpRight } from 'lucide-react';
import type { Flow, Graph, Operation, Relation, SymbolNode } from '@/lib/types';
import '@xyflow/react/dist/style.css';

type CardData = { symbol?: SymbolNode; operation?: Operation; members?: SymbolNode[]; active: boolean; visited?: boolean; onSelect: (id: string) => void };
type CardNode = Node<CardData, 'card'>;
const Card = memo(function Card({ data }: NodeProps<CardNode>) {
  const [expanded, setExpanded] = useState(true);
  const item = data.symbol;
  const op = data.operation;
  const kind = item?.kind || op?.kind || '';
  const Icon = kind === 'Class' ? Box : kind === 'Module' ? FileCode2 : kind === 'condition' || kind === 'loop' ? GitBranch : Braces;
  return <div className={`graph-card kind-${kind.toLowerCase()} ${data.active ? 'active' : ''} ${data.visited ? 'visited' : ''}`}>
    <Handle type="target" position={Position.Top} />
    <div className="card-top"><span className="card-kind"><Icon size={13} />{kind}</span><span className="card-line">{(item?.source || op?.source)?.start_line ? `L${(item?.source || op?.source)?.start_line}` : 'external'}</span></div>
    <strong title={item?.qualified_name || op?.expression}>{item?.name || op?.expression}</strong>
    {item && <small>{item.source?.file || 'Outside this snapshot'}</small>}
    {op && <small>{op.writes.length ? `defines ${op.writes.join(', ')}` : op.reads.length ? `reads ${op.reads.slice(0, 3).join(', ')}` : 'symbolic operation'}</small>}
    {item?.kind === 'Class' && <><button className="card-toggle nodrag" onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}>{expanded ? '−' : '+'} Members <span>{data.members?.length || 0}</span></button>{expanded && <div className="card-members">{data.members?.slice(0, 5).map(m => <button className="nodrag" key={m.id} onClick={e => { e.stopPropagation(); data.onSelect(m.id); }}><span className={m.kind === 'Attribute' ? 'purple' : 'mint'}>{m.kind === 'Attribute' ? 'a' : 'ƒ'}</span>{m.name}{m.kind === 'Method' ? '()' : ''}<ArrowUpRight size={11} /></button>)}{!data.members?.length && <small>Open inspector to explore</small>}{(data.members?.length || 0) > 5 && <small>+{data.members!.length - 5} in inspector</small>}</div>}</>}
    <Handle type="source" position={Position.Bottom} />
  </div>;
});
const nodeTypes = { card: Card };
const colors: Record<string, string> = { INHERITS: '#b39aff', INSTANTIATES: '#e4b973', CALLS: '#6be0bf', IMPORTS: '#7aabff', CONTAINS: '#596278' };
export default function GraphCanvas({ graph, flow, symbols, selected, visited, onSelect, onRelation, layoutKey }: {
  graph?: Graph; flow?: Flow; symbols: SymbolNode[]; selected: string | null; visited?: string[];
  onSelect: (id: string) => void; onRelation?: (edge: Relation) => void; layoutKey: number;
}) {
  const [instance, setInstance] = useState<ReactFlowInstance<CardNode> | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>([]);
  const topology = useMemo(() => {
    const items = flow ? flow.operations.map(op => ({ id: op.id, height: 125 })) : (graph?.nodes || []).map(n => ({ id: n.id, height: n.kind === 'Class' ? 245 : 120 }));
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 65, ranksep: 80, marginx: 30, marginy: 30 });
    g.setDefaultEdgeLabel(() => ({}));
    items.forEach(n => g.setNode(n.id, { width: 250, height: n.height }));
    const links = flow ? flow.edges.filter(e => e.kind === 'control') : graph?.edges || [];
    links.forEach(e => { if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target); });
    dagre.layout(g);
    return items.map(n => ({ ...n, position: { x: g.node(n.id).x - 125, y: g.node(n.id).y - n.height / 2 } }));
  }, [graph, flow]);
  const topologyKey = topology.map(n => n.id).sort().join(',');
  useEffect(() => { const timer = setTimeout(() => { void instance?.fitView({ padding: 0.2, maxZoom: 1 }); }, 100); return () => clearTimeout(timer); }, [layoutKey, topologyKey, instance]);
  useEffect(() => {
    if (selected && instance) {
      const n = topology.find(n => n.id === selected);
      if (n) instance.setCenter(n.position.x + 125, n.position.y + n.height / 2, { zoom: Math.max(0.65, Math.min(instance.getZoom(), 1)), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250 });
    }
  }, [selected, instance, topology]);
  useEffect(() => { setNodes(previous => topology.map(n => ({ ...previous.find(p => p.id === n.id), id: n.id, type: 'card', position: n.position,
    selected: selected === n.id,
    data: { symbol: graph?.nodes.find(s => s.id === n.id), operation: flow?.operations.find(o => o.id === n.id),
      members: symbols.filter(s => s.parent === n.id && ['Method', 'Attribute'].includes(s.kind)),
      active: selected === n.id, visited: visited?.includes(n.id), onSelect } }))); }, [topology, graph, flow, symbols, selected, visited, onSelect, setNodes]);
  const edges = flow ? flow.edges.map((e, i) => ({ id: `f-${i}`, source: e.source, target: e.target, label: e.label || (e.kind === 'data' ? 'data' : ''),
    animated: e.kind === 'data' && e.target === selected, style: { stroke: e.kind === 'data' ? '#6be0bf' : '#596278', strokeDasharray: e.kind === 'data' ? '5 4' : undefined, opacity: e.kind === 'data' ? 0.85 : 0.65 },
    markerEnd: { type: MarkerType.ArrowClosed, color: e.kind === 'data' ? '#6be0bf' : '#596278' } })) : (graph?.edges || []).map(e => ({ id: e.id, source: e.source, target: e.target,
    label: `${e.kind.toLowerCase()}${e.resolution !== 'resolved' ? ` · ${e.resolution}` : ''}`, style: { stroke: colors[e.kind] || '#8890a0', strokeDasharray: e.resolution === 'candidate' || e.kind === 'IMPORTS' ? '5 4' : undefined, opacity: selected && e.source !== selected && e.target !== selected ? 0.25 : 0.9 },
    markerEnd: { type: MarkerType.ArrowClosed, color: colors[e.kind] || '#8890a0' } }));
  return <ReactFlow<CardNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={setInstance} fitView minZoom={0.12} maxZoom={1.8}
    onNodesChange={onNodesChange}
    onNodeClick={(_, node) => onSelect(node.id)} onEdgeClick={(_, e) => { const relation = graph?.edges.find(r => r.id === e.id); if (relation) onRelation?.(relation); }}
    colorMode="dark" nodesConnectable={false}>
    <Background color="#303748" gap={22} size={1} /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor={n => n.id === selected ? '#6be0bf' : '#444d63'} maskColor="rgba(13,17,25,.75)" />
  </ReactFlow>;
}



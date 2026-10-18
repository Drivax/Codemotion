'use client';
import { operationText, label } from '@/lib/labels';
import { memo, useEffect, useMemo, useState, useRef } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, MarkerType, useNodesState, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { Box, Braces, FileCode2, GitBranch, ArrowUpRight } from 'lucide-react';
import type { CanvasState, GraphOptions } from '@/lib/session';
import type { Flow, Graph, Operation, Relation, SymbolNode } from '@/lib/types';
import '@xyflow/react/dist/style.css';

type CardData = { symbol?: SymbolNode; operation?: Operation; members?: SymbolNode[]; active: boolean; visited?: boolean; exportSelected?: boolean; onToggleExport?: (id: string) => void; onSelect: (id: string) => void };
type CardNode = Node<CardData, 'card'>;
const Card = memo(function Card({ data }: NodeProps<CardNode>) {
  const [expanded, setExpanded] = useState(true);
  const item = data.symbol;
  const op = data.operation;
  const kind = item?.kind || op?.kind || '';
  const Icon = kind === 'Class' ? Box : kind === 'Module' ? FileCode2 : kind === 'condition' || kind === 'loop' ? GitBranch : Braces;
  return <div className={`graph-card kind-${kind.toLowerCase()} ${data.active ? 'active' : ''} ${data.visited ? 'visited' : ''}`}>
    <button className="graph-export-toggle nodrag" aria-label={`Sélectionner pour export : ${item?.name || (op ? operationText(op) : '')}`} aria-pressed={!!data.exportSelected} onClick={e => { e.stopPropagation(); data.onToggleExport?.(item?.id || op!.id); }}>{data.exportSelected ? '☑' : '☐'}</button><Handle type="target" position={Position.Top} />
    <div className="card-top"><span className="card-kind"><Icon size={13} />{label(kind)}</span><span className="card-line">{(item?.source || op?.source)?.start_line ? `L${(item?.source || op?.source)?.start_line}` : kind === 'Directory' ? 'groupe' : 'external'}</span></div>
    <strong title={item?.qualified_name || op?.expression}>{item?.name || (op ? operationText(op) : '')}</strong>
    {item && <small>{item.source?.file || item.metadata.path || 'Hors de ce snapshot'}</small>}
    {op && <small>{op.writes.length ? `définit ${op.writes.join(', ')}` : op.reads.length ? `lit ${op.reads.slice(0, 3).join(', ')}` : 'opération symbolique'}</small>}
    {item?.kind === 'Class' && <><button className="card-toggle nodrag" onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}>{expanded ? '−' : '+'} Membres <span>{data.members?.length || 0}</span></button>{expanded && <div className="card-members">{data.members?.slice(0, 5).map(m => <button className="nodrag" key={m.id} onClick={e => { e.stopPropagation(); data.onSelect(m.id); }}><span className={m.kind === 'Attribute' ? 'purple' : 'mint'}>{m.kind === 'Attribute' ? 'a' : 'ƒ'}</span>{m.name}{m.kind === 'Method' ? '()' : ''}<ArrowUpRight size={11} /></button>)}{!data.members?.length && <small>Ouvrir l’inspecteur pour explorer</small>}{(data.members?.length || 0) > 5 && <small>+{data.members!.length - 5} dans l’inspecteur</small>}</div>}</>}
    <Handle type="source" position={Position.Bottom} />
  </div>;
});
const nodeTypes = { card: Card };
const colors: Record<string, string> = { INHERITS: '#b39aff', INSTANTIATES: '#e4b973', CALLS: '#6be0bf', IMPORTS: '#7aabff', CONTAINS: '#596278' };
export default function GraphCanvas({ graph, flow, symbols, selected, visited, onSelect, onRelation, layoutKey, options, saved, onSave, restoredSelection, exportSelected, onToggleExport }: {
  exportSelected?: string[]; onToggleExport?: (id: string) => void;
  graph?: Graph; flow?: Flow; symbols: SymbolNode[]; selected: string | null; visited?: string[];
  restoredSelection?: string | null; onSelect: (id: string) => void; onRelation?: (edge: Relation) => void; layoutKey: number; options?: GraphOptions; saved?: CanvasState; onSave?: (state: CanvasState) => void;
}) {
  const initialSaved = useRef(saved);
  const restoredTarget = useRef(restoredSelection);
  const [instance, setInstance] = useState<ReactFlowInstance<CardNode> | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>([]);
  const topology = useMemo(() => {
    const items = flow ? flow.operations.map(op => ({ id: op.id, height: 125 })) : (graph?.nodes || []).map(n => ({ id: n.id, height: n.kind === 'Class' ? 245 : 120 }));
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: options?.orientation || 'TB', nodesep: 65, ranksep: 80, marginx: 30, marginy: 30 });
    g.setDefaultEdgeLabel(() => ({}));
    items.forEach(n => g.setNode(n.id, { width: 250, height: n.height }));
    const links = flow ? flow.edges.filter(e => e.kind === 'control') : graph?.edges || [];
    links.forEach(e => { if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target); });
    dagre.layout(g);
    return items.map(n => ({ ...n, position: { x: g.node(n.id).x - 125, y: g.node(n.id).y - n.height / 2 } }));
  }, [graph, flow, options?.orientation]);

  useEffect(() => { const timer = setTimeout(() => { if (!initialSaved.current?.viewport) void instance?.fitView({ padding: 0.2, maxZoom: 1 }); }, 100); return () => clearTimeout(timer); }, [layoutKey, instance]);
  useEffect(() => {
    // Wait for the newly filtered nodes to be mounted before fitting a decision.
    const timer = window.setTimeout(() => {
      if (!selected || !instance || options?.follow === false) return;
      if (selected === restoredTarget.current && initialSaved.current?.viewport) return;
      restoredTarget.current = null;
      const n = instance.getNode(selected);
      const branches = flow?.edges.filter(e => e.kind === 'control' && e.source === selected) || [];
      if (n && branches.length > 1) {
        void instance.fitView({ nodes: [{ id: selected }, ...branches.map(e => ({ id: e.target }))], padding: 0.3, maxZoom: 1, duration: 0 });
      } else if (n) void instance.setCenter(n.position.x + 125, n.position.y + (n.measured?.height || 120) / 2, { zoom: Math.max(0.65, Math.min(instance.getZoom(), 1)), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250 });
    }, 100);
    return () => clearTimeout(timer);
  }, [selected, instance, options?.follow, flow]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const recenter = () => { clearTimeout(timer); timer = setTimeout(() => {
      if (!instance || options?.follow === false) return;
      const node = selected ? instance.getNode(selected) : undefined;
      if (node) void instance.setCenter(node.position.x + 125, node.position.y + (node.measured?.height || 120) / 2, { zoom: Math.min(instance.getZoom(), 1) });
      else void instance.fitView({ padding: 0.2, maxZoom: 1 });
    }, 150); };
    window.addEventListener('resize', recenter);
    return () => { clearTimeout(timer); window.removeEventListener('resize', recenter); };
  }, [instance, selected, options?.follow]);
  useEffect(() => { setNodes(previous => topology.map(n => ({ ...previous.find(p => p.id === n.id), id: n.id, type: 'card', position: previous.find(p => p.id === n.id)?.position || saved?.positions[n.id] || n.position,
    selected: selected === n.id,
    data: { symbol: graph?.nodes.find(s => s.id === n.id), operation: flow?.operations.find(o => o.id === n.id),
      members: symbols.filter(s => s.parent === n.id && ['Method', 'Attribute'].includes(s.kind)),
      exportSelected: exportSelected?.includes(n.id), onToggleExport, active: selected === n.id, visited: visited?.includes(n.id), onSelect } }))); }, [topology, graph, flow, symbols, selected, visited, onSelect, setNodes, saved, exportSelected, onToggleExport]);
  const edges = flow ? flow.edges.filter(e => (!options || options.edgeMode === 'both' || e.kind === options.edgeMode) && (e.kind !== 'data' || ((!options?.variable || e.label === options.variable) && (!options?.hideSelf || e.label !== 'self')))).map((e, i) => ({ id: `f-${i}`, source: e.source, target: e.target, label: label(e.label || (e.kind === 'data' ? 'données' : '')),
    animated: false, style: { stroke: e.kind === 'data' ? '#6be0bf' : visited?.some((id, j) => id === e.source && visited[j + 1] === e.target) ? '#f6bf60' : '#596278', strokeWidth: visited?.some((id, j) => id === e.source && visited[j + 1] === e.target) ? 3 : 1.5, strokeDasharray: e.kind === 'data' ? '5 4' : undefined, opacity: options?.dimSecondary !== false && e.source !== selected && e.target !== selected && !visited?.some((id, j) => id === e.source && visited[j + 1] === e.target) ? 0.18 : 0.9 },
    markerEnd: { type: MarkerType.ArrowClosed, color: e.kind === 'data' ? '#6be0bf' : '#596278' } })) : (graph?.edges || []).map(e => ({ id: e.id, source: e.source, target: e.target,
    label: `${e.label ? e.label + ' · ' : ''}${label(e.kind)}${e.resolution !== 'resolved' ? ` · ${label(e.resolution)}` : ''}`, style: { stroke: colors[e.kind] || '#8890a0', strokeDasharray: e.resolution === 'candidate' || e.kind === 'IMPORTS' ? '5 4' : undefined, opacity: selected && e.source !== selected && e.target !== selected ? 0.25 : 0.9 },
    markerEnd: { type: MarkerType.ArrowClosed, color: colors[e.kind] || '#8890a0' } }));
  return <ReactFlow<CardNode> ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': 'Agrandir le graphe', 'controls.zoomOut.ariaLabel': 'Réduire le graphe', 'controls.fitView.ariaLabel': 'Cadrer tout le graphe', 'node.a11yDescription.default': 'Entrée pour sélectionner une opération, flèches pour déplacer sa carte, Échap pour désélectionner.' }} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={i => { setInstance(i); if (saved?.viewport) void i.setViewport(saved.viewport); }} fitView={!saved?.viewport} minZoom={0.12} maxZoom={1.8}
    onNodesChange={onNodesChange} onMoveEnd={(_, viewport) => { if (instance) onSave?.({ viewport, positions: Object.fromEntries(instance.getNodes().map(n => [n.id, n.position])) }); }} onNodeDragStop={() => { if (instance) onSave?.({ viewport: instance.getViewport(), positions: Object.fromEntries(instance.getNodes().map(n => [n.id, n.position])) }); }}
    onNodeClick={(_, node) => onSelect(node.id)} onEdgeClick={(_, e) => { const relation = graph?.edges.find(r => r.id === e.id); if (relation) onRelation?.(relation); }}
    colorMode={options?.light ? "light" : "dark"} nodesConnectable={false}>
    <Background color="#303748" gap={22} size={1} /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor={n => n.id === selected ? '#6be0bf' : '#444d63'} maskColor="rgba(13,17,25,.75)" />
  </ReactFlow>;
}



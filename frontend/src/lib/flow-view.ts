import type { Flow } from './types';
// Control distance keeps both alternatives visible; data links do not flood the neighborhood.
export function aroundOperation(flow: Flow, selected: string | null, depth = 2): Flow {
  if (!selected) return flow;
  const ids = new Set([selected]);
  let frontier = new Set(ids);
  for (let i = 0; i < depth; i++) {
    const next = new Set<string>();
    for (const edge of flow.edges) if (edge.kind === 'control') {
      if (frontier.has(edge.source) && !ids.has(edge.target)) next.add(edge.target);
      if (frontier.has(edge.target) && !ids.has(edge.source)) next.add(edge.source);
    }
    next.forEach(id => ids.add(id)); frontier = next;
  }
  return { ...flow, operations: flow.operations.filter(o => ids.has(o.id)), edges: flow.edges.filter(e => ids.has(e.source) && ids.has(e.target)) };
}

import type { Playback } from './playback';
import type { Flow, Graph, Summary } from './types';
import type { CanvasState, GraphOptions } from './session';
export function download(name: string, text: string | Blob, type = 'text/plain') {
  const url = URL.createObjectURL(typeof text === 'string' ? new Blob([text], { type }) : text);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const xml = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
export async function exportView(format: string, summary: Summary, graph: Graph, flow: Flow | null, options: GraphOptions, canvas?: CanvasState, selected?: string | null, selectionOnly = false, playback?: Playback | null, functionName?: string) {
  const nodes = flow ? flow.operations.map(o => ({ id: o.id, name: o.expression, kind: o.kind, source: o.source })) : graph.nodes;
  const chosen = selectionOnly ? nodes.filter(n => n.id === selected) : nodes;
  const ids = new Set(chosen.map(n => n.id));
  const edges = (flow ? flow.edges.filter(e => (options.edgeMode === 'both' || e.kind === options.edgeMode) && (e.kind !== 'data' || ((!options.variable || e.label === options.variable) && (!options.hideSelf || e.label !== 'self')))) : graph.edges).filter(e => ids.has(e.source) && ids.has(e.target));
  const meta = { repository: summary.repository, engine: summary.engine_version, schema_version: '2.0', scope: selectionOnly ? 'selected node' : 'displayed graph', filters: { ...options, graphScope: graph.scope }, truncated: flow ? flow.limitations.length > 0 : !!graph.truncated, nodes: chosen.length, edges: edges.length, uncertainty: 'Static, incomplete; no runtime execution.', created: new Date().toISOString() };
  const name = `codemotion-${summary.repository.snapshot.slice(0, 7)}`;
  if (format === 'json') return download(name + '.json', JSON.stringify({ metadata: meta, nodes: chosen, edges }, null, 2), 'application/json');
  const index = new Map(chosen.map((n, i) => [n.id, `n${i}`]));
  const mermaid = `flowchart ${options.orientation}\n` + chosen.map(n => `  ${index.get(n.id)}["${n.name.replace(/[^\p{L}\p{N} ._:()=-]/gu, ' ').slice(0, 120)}"]`).join('\n') + '\n' + edges.map(e => `  ${index.get(e.source)} -->|"${(e.label || e.kind).replace(/[^\p{L}\p{N} ._:=-]/gu, ' ')}"| ${index.get(e.target)}`).join('\n');
  if (format === 'mermaid') return download(name + '.mmd', `%% ${JSON.stringify(meta)}\n${mermaid}`);
  if (format === 'markdown' && flow && playback) {
    const lines = playback.trail.slice(0, playback.index + 1).map((id, i, trail) => {
      const op = flow.operations.find(o => o.id === id)!;
      const branch = i ? flow.edges.find(e => e.kind === 'control' && e.source === trail[i - 1] && e.target === id)?.label : '';
      return `${i + 1}. ${branch ? '**Décision hypothétique : ' + branch + '** — ' : ''}${op.expression.replace(/[\r\n]/g, ' ')} — ${op.source.file}:${op.source.start_line}`;
    });
    return download(name + '-parcours.md', `# Parcours : ${functionName || flow.function_id}\n\nProjet : ${summary.repository.name}\nSnapshot : ${summary.repository.snapshot}\nRévision : ${summary.repository.revision || 'locale'}\nMoteur : ${summary.engine_version}\n\nParcours hypothétique, code non exécuté. ${playback.index + 1} étapes parcourues, ${flow.operations.length} opérations dans la fonction.\n\n${lines.join('\n')}\n\n## Limites\n\n${flow.limitations.join('\n')}\nLes branches ne sont pas évaluées et les valeurs runtime restent indisponibles.\n\nFiltres : ${JSON.stringify(meta.filters)}\n`);
  }
  if (format === 'markdown') return download(name + '.md', `# ${summary.repository.name}\n\nSnapshot: ${summary.repository.snapshot}\nRévision: ${summary.repository.revision || 'locale'}\nMoteur: ${summary.engine_version}\nPérimètre: ${meta.scope}; ${meta.nodes} nœuds, ${meta.edges} liens. Tronqué: ${meta.truncated}.\n\n${meta.uncertainty}\n\nFiltres: ${JSON.stringify(options)}\n\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n\n` + chosen.map(n => `- ${n.name.replace(/[\r\n]/g, ' ')} — ${n.source ? `${n.source.file}:${n.source.start_line}` : 'externe'}`).join('\n'));
  const positions = chosen.map((n, i) => ({ ...n, x: canvas?.positions[n.id]?.x ?? (i % 4) * 300, y: canvas?.positions[n.id]?.y ?? Math.floor(i / 4) * 170 }));
  const minX = Math.min(0, ...positions.map(n => n.x)) - 30, minY = Math.min(0, ...positions.map(n => n.y)) - 90;
  const width = Math.max(800, ...positions.map(n => n.x + 290)) - minX, height = Math.max(200, ...positions.map(n => n.y + 140)) - minY;
  const bg = options.light ? '#f8fafc' : '#111722', fg = options.light ? '#182230' : '#e6edf5';
  const byId = new Map(positions.map(n => [n.id, n]));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}"><metadata>${xml(JSON.stringify(meta))}</metadata><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${bg}"/><g font-family="sans-serif" fill="${fg}"><text x="${minX + 20}" y="${minY + 25}">${xml(summary.repository.name)} · ${summary.repository.snapshot.slice(0, 7)} · ${meta.nodes} nœuds · analyse statique${meta.truncated ? ' · vue tronquée' : ''}</text>${edges.map(e => { const a = byId.get(e.source)!, b = byId.get(e.target)!; return `<path d="M${a.x + 125},${a.y + 100} L${b.x + 125},${b.y}" stroke="#53b39b" fill="none"/><text font-size="10" x="${(a.x + b.x) / 2 + 125}" y="${(a.y + b.y) / 2 + 45}">${xml(e.label || e.kind)}</text>`; }).join('')}${positions.map(n => `<rect x="${n.x}" y="${n.y}" rx="10" width="250" height="100" fill="${bg}" stroke="#687990"/><text x="${n.x + 12}" y="${n.y + 20}" font-size="11">${xml(n.kind)}</text><text x="${n.x + 12}" y="${n.y + 45}" font-size="13">${xml(n.name.slice(0, 30))}</text><text x="${n.x + 12}" y="${n.y + 76}" font-size="10">${xml((n.source?.file || 'externe').slice(-36))}</text>`).join('')}</g></svg>`;
  if (format === 'svg') return download(name + '.svg', svg, 'image/svg+xml');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try { const image = new Image(); image.src = url; await image.decode(); const c = document.createElement('canvas'); const scale = Math.min(1, 8192 / width, 8192 / height, Math.sqrt(32_000_000 / (width * height))); c.width = Math.ceil(width * scale); c.height = Math.ceil(height * scale); c.getContext('2d')!.drawImage(image, 0, 0, c.width, c.height); const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png')); if (!blob) throw new Error('PNG indisponible'); download(name + '.png', blob); } finally { URL.revokeObjectURL(url); }
}

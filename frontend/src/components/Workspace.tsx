'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { Activity, ArrowLeft, ArrowUpRight, Box, Braces, Check, ChevronDown, Code2, Download, FileCode2, FolderOpen, GitBranch, Play, Layers3, LoaderCircle, Search, Settings2, Sun, Moon, Upload, X, Network, RotateCcw } from 'lucide-react';
import { API, api, post } from '@/lib/api';
import type { Details, FileRecord, Flow, Graph, Job, Relation, SourceLocation, Summary, SymbolNode } from '@/lib/types';
import { initialPlayback, type Playback } from '@/lib/playback';
import Player from './Player';
const GraphCanvas = dynamic(() => import('./GraphCanvas'), { ssr: false, loading: () => <div className="empty-small">Preparing canvas…</div> });
const SourceEditor = dynamic(() => import('./SourceEditor'), { ssr: false });
interface View { mode: 'objects' | 'flow'; selected: string | null; flowId: string | null; playback: Playback | null }
const initialView: View = { mode: 'objects', selected: null, flowId: null, playback: null };
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
const defaultKinds = ['Class', 'Function'];
const allKinds = ['Class', 'Function', 'Method', 'Module'];
export default function Workspace() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [], total: 0 });
  const [symbols, setSymbols] = useState<SymbolNode[]>([]);
  const [view, setView] = useState<View>(initialView);
  const [history, setHistory] = useState<View[]>([]);
  const [details, setDetails] = useState<Details | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [source, setSource] = useState('');
  const [sourceOverride, setSourceOverride] = useState<SourceLocation | null>(null);
  const [relation, setRelation] = useState<Relation | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [github, setGithub] = useState('');
  const [search, setSearch] = useState('');
  const [kinds, setKinds] = useState(defaultKinds);
  const [relations, setRelations] = useState(['CONTAINS', 'INHERITS', 'INSTANTIATES', 'CALLS', 'IMPORTS']);
  const [focus, setFocus] = useState(false);
  const [graphLimit, setGraphLimit] = useState(60);
  const [layoutKey, setLayoutKey] = useState(0);
  const [light, setLight] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [settings, setSettings] = useState(false);
  const [explorerWidth, setExplorerWidth] = useState(242);
  const [inspectorWidth, setInspectorWidth] = useState(320);
  const [sourceHeight, setSourceHeight] = useState(230);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const detailsCache = useRef(new Map<string, Details>());
  const flowCache = useRef(new Map<string, Flow>());
  const sourceCache = useRef(new Map<string, string>());
  const requestEpoch = useRef(0);
  const repo = summary?.repository.id;
  const active = flow?.operations.find(o => o.id === view.playback?.trail[view.playback.index]);
  const currentSymbol = symbols.find(s => s.id === view.selected) || details?.symbol;
  const sourceLocation = sourceOverride || (view.mode === 'flow' ? active?.source : details?.symbol.source) || null;
  const running = busy || job?.status === 'running' || job?.status === 'queued';

  const navigate = useCallback((next: View) => {
    setHistory(h => [...h, view].slice(-40)); setView(next); setSourceOverride(null); setRelation(null);
  }, [view]);
  const select = useCallback((id: string) => navigate({ ...view, mode: 'objects', selected: id }), [navigate, view]);
  const back = () => { const previous = history.at(-1); if (previous) { setView(previous); setHistory(h => h.slice(0, -1)); setSourceOverride(null); setRelation(null); } };

  const loadRepository = useCallback(async (id: string) => {
    const [meta, graphData] = await Promise.all([api<Summary>(`/repositories/${id}`), api<Graph>(`/repositories/${id}/graph?limit=5000`)]);
    const items: SymbolNode[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await api<{ items: SymbolNode[]; total: number }>(`/repositories/${id}/symbols?offset=${offset}&limit=1000`);
      items.push(...page.items); if (items.length >= page.total) break;
    }
    detailsCache.current.clear(); flowCache.current.clear(); sourceCache.current.clear();
    items.sort((a, b) => (a.source?.file || '').localeCompare(b.source?.file || '') || (a.source?.start_line || 0) - (b.source?.start_line || 0));
    setSummary(meta); setGraph(graphData); setSymbols(items); setFocus(graphData.nodes.length > 80); setHistory([]); setSourceOverride(null); setRelation(null); setFlow(null);
    setView({ ...initialView, selected: items.find(n => n.kind === 'Class')?.id || items.find(n => n.kind === 'Function')?.id || items[0]?.id || null });
    setImportOpen(false); setJob(null); setSearch(''); setError('');
  }, []);

  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const updated = await api<Job>(`/jobs/${job.id}`);
        if (cancelled) return;
        if (updated.status === 'completed' && updated.repository_id) await loadRepository(updated.repository_id);
        else { setJob(updated); if (updated.status === 'failed') setError(updated.error || 'Analysis failed'); }
      } catch (e) { if (!cancelled) { setError(errorText(e)); setJob(null); } }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [job, loadRepository]);

  useEffect(() => {
    if (!repo || !view.selected) return;
    let cancelled = false;
    const id = view.selected;
    const cached = detailsCache.current.get(id);
    if (cached) { setDetails(cached); return; }
    setDetails(null);
    api<Details>(`/repositories/${repo}/symbols/${id}`).then(data => {
      if (!cancelled) { detailsCache.current.set(id, data); setDetails(data); }
    }).catch(e => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
  }, [repo, view.selected]);

  useEffect(() => {
    if (!repo || !view.flowId) return;
    let cancelled = false;
    const id = view.flowId;
    const cached = flowCache.current.get(id);
    if (cached) { setFlow(cached); return; }
    api<Flow>(`/repositories/${repo}/flows/${id}`).then(data => {
      if (!cancelled) { flowCache.current.set(id, data); setFlow(data); }
    }).catch(e => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
  }, [repo, view.flowId]);

  useEffect(() => {
    if (!repo || !sourceLocation) return;
    let cancelled = false;
    const path = sourceLocation.file;
    const cached = sourceCache.current.get(path);
    if (cached !== undefined) { setSource(cached); return; }
    setSource('');
    api<FileRecord>(`/repositories/${repo}/source?path=${encodeURIComponent(path)}`).then(data => {
      if (!cancelled) { sourceCache.current.set(path, data.source || ''); setSource(data.source || ''); }
    }).catch(e => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
  }, [repo, sourceLocation]);

  const openFlow = async (id: string) => {
    if (!repo) return;
    if (history.filter(h => h.mode === 'flow').length >= 8) { setError('Exploration depth limit (8) reached. Go back before entering another call.'); return; }
    try {
      const data = flowCache.current.get(id) || await api<Flow>(`/repositories/${repo}/flows/${id}`);
      flowCache.current.set(id, data); setFlow(data);
      navigate({ mode: 'flow', selected: id, flowId: id, playback: initialPlayback(data) });
    } catch (e) { setError(errorText(e)); }
  };
  const setPlayback = useCallback((playback: Playback) => { setSourceOverride(null); setView(v => ({ ...v, playback })); }, []);

  const importExample = async (name: string) => {
    setError(''); setBusy(true);
    try { setJob(await post<Job>(`/examples/${name}`)); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(''); setBusy(true);
    try {
      const ignored = new Set(['.git', '.venv', 'venv', '__pycache__', 'node_modules', 'dist', 'build', '.pytest_cache', '.mypy_cache']);
      const selected = [...files].filter(f => (f.name.endsWith('.py') || f.name === '.gitignore') && !f.webkitRelativePath.split('/').some(p => ignored.has(p)));
      if (selected.length > 2000 || selected.reduce((total, f) => total + f.size, 0) > 20000000 || selected.some(f => f.size > 1000000)) throw new Error('Import exceeds limits: 2,000 files, 20 MB total, 1 MB per file.');
      if (!selected.length) throw new Error('No Python files in the selected folder.');
      const payload: Record<string, string> = {};
      for (const file of selected) { const path = file.webkitRelativePath.split('/').slice(1).join('/') || file.name; payload[path] = await file.text(); }
      setJob(await post<Job>('/repositories/import', { name: files[0].webkitRelativePath.split('/')[0] || 'local-project', files: payload }));
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  };
  const importGithub = async () => {
    setError(''); setBusy(true);
    try { setJob(await post<Job>('/repositories/import', { github_url: github })); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const resize = (event: React.PointerEvent, panel: 'left' | 'right' | 'bottom') => {
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, left: explorerWidth, right: inspectorWidth, bottom: sourceHeight };
    const move = (e: PointerEvent) => {
      if (panel === 'left') setExplorerWidth(Math.max(185, Math.min(430, start.left + e.clientX - start.x)));
      if (panel === 'right') setInspectorWidth(Math.max(250, Math.min(520, start.right - e.clientX + start.x)));
      if (panel === 'bottom') setSourceHeight(Math.max(120, Math.min(550, start.bottom - e.clientY + start.y)));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const visibleGraph = useMemo(() => {
    let nodes = graph.nodes.filter(n => (kinds.includes(n.kind) || n.id === view.selected) && (!search || n.qualified_name.toLowerCase().includes(search.toLowerCase())));
    if (focus && view.selected) {
      const adjacent = new Set([view.selected]);
      graph.edges.forEach(e => { if (e.source === view.selected || e.target === view.selected) { adjacent.add(e.source); adjacent.add(e.target); } });
      nodes = nodes.filter(n => adjacent.has(n.id));
    }
    const total = nodes.length;
    nodes = [...nodes].sort((a, b) => Number(b.id === view.selected) - Number(a.id === view.selected)).slice(0, graphLimit);
    const ids = new Set(nodes.map(n => n.id));
    return { nodes, edges: graph.edges.filter(e => ids.has(e.source) && ids.has(e.target) && relations.includes(e.kind)), total };
  }, [graph, kinds, search, focus, view.selected, graphLimit, relations]);
  const findName = (id: string) => symbols.find(n => n.id === id)?.name || graph.nodes.find(n => n.id === id)?.name || details?.children.find(n => n.id === id)?.name || id.slice(0, 8);
  const attributes = details?.children.filter(n => n.kind === 'Attribute') || [];
  const methods = (details?.children.filter(n => ['Method', 'Function'].includes(n.kind)) || []).sort((a, b) => (a.source?.start_line || 0) - (b.source?.start_line || 0));
  const calls = details?.children.filter(n => n.kind === 'CallSite' && active?.calls.includes(n.id)) || [];
  const variables = useMemo(() => {
    const values = new Map<string, { expression: string; literal: string | null; version: string }>();
    if (view.playback && flow) for (const id of view.playback.trail.slice(0, view.playback.index + 1)) {
      const op = flow.operations.find(o => o.id === id);
      op?.writes.forEach(name => values.set(name, { expression: op.expression, literal: op.literal, version: op.definitions[name] }));
    }
    return [...values];
  }, [flow, view.playback]);
  const selectedFileNodes = (path: string) => symbols.filter(n => n.source?.file === path && ['Class', 'Function', 'Method'].includes(n.kind) && (!search || n.qualified_name.toLowerCase().includes(search.toLowerCase())));

  return <div className={`workspace ${light ? 'light' : ''}`} style={{ '--explorer-width': `${explorerWidth}px`, '--inspector-width': `${inspectorWidth}px`, '--source-height': `${sourceHeight}px` } as CSSProperties}>
    <input ref={fileInput} type="file" multiple {...{ webkitdirectory: '' }} className="hidden" aria-label="Import Python folder" onChange={e => void importFiles(e.target.files)} />
    <header className="topbar"><div className="brand"><span className="brand-mark"><Activity size={21} /></span>CodeMotion<span className="version">LOCAL</span></div>
      {summary && <div className="repo-title"><GitBranch size={14} />{summary.repository.name}<span className="snapshot">{summary.repository.snapshot.slice(0, 7)}</span></div>}
      <div className="top-actions"><span className="privacy"><span className="status-dot" />Static analysis · no code execution</span><button aria-label="Toggle color theme" title="Toggle color theme" onClick={() => setLight(!light)}>{light ? <Moon size={16} /> : <Sun size={16} />}</button><button className="secondary" onClick={() => setImportOpen(true)}><Upload size={14} />Import repository</button></div>
    </header>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={15} /></button></div>}
    {running && <div className="progress-banner" role="status"><LoaderCircle className="spin" size={16} /><span>{busy ? 'Preparing repository…' : job?.progress}</span>{job && <button onClick={async () => { requestEpoch.current++; setJob(await api<Job>(`/jobs/${job.id}`, { method: 'DELETE' })); }}>Cancel analysis</button>}</div>}
    {!summary ? <main className="welcome"><div className="welcome-grid" /><div className="welcome-content"><div className="eyebrow"><span className="status-dot" />A CLEARER PICTURE OF YOUR CODE</div><h1>From source code<br />to <em>understanding.</em></h1><p>Explore the objects, connections, and data paths inside a Python repository. Grounded in your source. Entirely local.</p><div className="welcome-actions"><button className="primary" disabled={running} onClick={() => fileInput.current?.click()}><FolderOpen size={17} />Open a Python folder</button><button className="secondary" disabled={running} onClick={() => void importExample('multi-module')}><Play size={15} />Explore the example</button></div><div className="welcome-note">No account. No API key. Your code is never executed.</div><div className="feature-grid"><article><Box size={22} /><h3>Object Inspector</h3><p>Classes, attributes, inheritance.<br />See how the pieces connect.</p></article><article><GitBranch size={22} /><h3>Static Flow Player</h3><p>Follow definitions and dependencies.<br />Explore each possible path.</p></article><article><Code2 size={22} /><h3>Source as truth</h3><p>Every symbol points to real code.<br />Uncertainty stays visible.</p></article></div></div><div className="welcome-footer">PYTHON 3.11+ <span>AST-BASED ANALYSIS</span> OPEN SOURCE</div></main> : <>
      <nav className="modebar"><button className={view.mode === 'objects' ? 'mode active' : 'mode'} onClick={() => setView(v => ({ ...v, mode: 'objects' }))}><Box size={16} />Object Inspector</button><button className={view.mode === 'flow' ? 'mode active' : 'mode'} disabled={!view.flowId} onClick={() => setView(v => ({ ...v, mode: 'flow' }))}><GitBranch size={16} />Data Flow Player</button><div className="mode-spacer" /><span>{summary.files.length} files</span><span>{symbols.filter(s => s.kind === 'Class').length} classes</span><span>{Math.round(summary.metrics.total_ms)} ms analysis</span><a className="icon-link" title="Export analysis JSON" aria-label="Export analysis JSON" href={`${API}/api/repositories/${repo}/export`}><Download size={15} /></a></nav>
      <div className="workbench"><aside className="explorer"><div className="panel-heading">EXPLORER <Layers3 size={13} /></div><label className="search"><Search size={14} /><input aria-label="Search symbols" placeholder="Find a symbol…" value={search} onChange={e => setSearch(e.target.value)} /><kbd>⌕</kbd></label><div className="file-tree"><div className="tree-root"><ChevronDown size={13} /><FolderOpen size={14} />{summary.repository.name}</div>{summary.files.map(file => <details key={file.path} open className="file-group"><summary><FileCode2 size={13} /><span onClick={() => setSourceOverride({ file: file.path, start_line: 1, end_line: 1, start_column: 0, end_column: 0 })}>{file.path}</span>{!file.parsed && <span className="error-text">!</span>}</summary>{selectedFileNodes(file.path).map(n => <button key={n.id} className={`tree-symbol ${view.selected === n.id ? 'selected' : ''} ${n.kind === 'Method' ? 'indented' : ''}`} title={n.qualified_name} onClick={() => select(n.id)}><span className={n.kind === 'Class' ? 'purple' : 'mint'}>{n.kind === 'Class' ? <Box size={13} /> : <Braces size={13} />}</span><span>{n.name}</span>{n.kind === 'Class' && <small>class</small>}</button>)}</details>)}</div><div className="explorer-bottom"><span className="status-dot" />Snapshot loaded locally<br /><small>{summary.repository.revision ? `Revision ${summary.repository.revision.slice(0, 12)}` : 'Content-addressed snapshot'}</small></div></aside>
      <div className="resize-handle vertical left" onPointerDown={e => resize(e, 'left')} />
      <section className="canvas-column"><div className="canvas-toolbar"><button title="Back" aria-label="Back" disabled={!history.length} onClick={back}><ArrowLeft size={15} /></button><span className="breadcrumb">{view.mode === 'flow' ? 'Static flow' : 'Repository'}<span>/</span><strong>{currentSymbol?.name || 'Overview'}</strong></span><div className="mode-spacer" />{view.mode === 'objects' && <button className={focus ? 'tool active' : 'tool'} onClick={() => setFocus(!focus)}><Network size={14} />Focus</button>}<button title="Reset layout" aria-label="Reset layout" onClick={() => setLayoutKey(k => k + 1)}><RotateCcw size={14} /></button><button title="Graph filters" aria-label="Graph filters" onClick={() => setSettings(!settings)}><Settings2 size={15} /></button></div>
      {settings && <div className="filter-panel"><strong>Show nodes</strong>{[...allKinds, 'ExternalDependency', 'Unknown'].map(kind => <label key={kind}><input type="checkbox" checked={kinds.includes(kind)} onChange={() => setKinds(k => k.includes(kind) ? k.filter(v => v !== kind) : [...k, kind])} />{kind}</label>)}<strong>Relations</strong>{['CONTAINS', 'INHERITS', 'INSTANTIATES', 'CALLS', 'IMPORTS'].map(kind => <label key={kind}><input type="checkbox" checked={relations.includes(kind)} onChange={() => setRelations(r => r.includes(kind) ? r.filter(v => v !== kind) : [...r, kind])} />{kind.toLowerCase()}</label>)}</div>}
      <div className="graph-area">{view.mode === 'flow' && flow ? <GraphCanvas flow={flow} symbols={symbols} selected={active?.id || null} visited={view.playback?.trail.slice(0, view.playback.index + 1)} onSelect={id => setPlayback({ trail: [id], index: 0 })} layoutKey={layoutKey} /> : <GraphCanvas graph={visibleGraph} symbols={symbols} selected={view.selected} onSelect={select} onRelation={r => { setRelation(r); setSourceOverride(r.provenance); }} layoutKey={layoutKey} />}
      <div className="canvas-caption"><span>{view.mode === 'flow' ? 'CONTROL + DATA DEPENDENCIES' : 'ARCHITECTURE MAP'}</span><strong>{view.mode === 'flow' ? `${flow?.operations.length || 0} operations` : `${visibleGraph.nodes.length} of ${visibleGraph.total} symbols`}</strong></div>{view.mode === 'objects' && visibleGraph.nodes.length < visibleGraph.total && <button className="show-more secondary" onClick={() => setGraphLimit(n => n + 60)}>Show 60 more</button>}{view.mode === 'objects' && !visibleGraph.nodes.length && <div className="canvas-empty">No symbols match these filters.</div>}<div className="legend"><span><i className="legend-line mint-line" />{view.mode === 'flow' ? 'data (dashed)' : 'calls'}</span><span><i className="legend-line purple-line" />{view.mode === 'flow' ? 'control (solid)' : 'inherits'}</span>{view.mode === 'objects' && <span><i className="legend-line amber-line" />instantiates</span>}</div></div>
      {view.mode === 'flow' && flow && view.playback && <Player flow={flow} playback={view.playback} onChange={setPlayback} />}</section>
      <div className="resize-handle vertical right" onPointerDown={e => resize(e, 'right')} />
      <aside className="inspector"><div className="panel-heading">{view.mode === 'flow' ? 'OPERATION INSPECTOR' : 'SYMBOL INSPECTOR'}<Box size={13} /></div>{relation ? <div className="inspector-content"><span className={`badge ${relation.resolution}`}>{relation.resolution}</span><h2>{relation.kind}</h2><p>{findName(relation.source)} → {findName(relation.target)}</p><p>{relation.provenance?.file}:{relation.provenance?.start_line}</p><button className="secondary" onClick={() => { setRelation(null); select(relation.target); }}>Inspect target <ArrowUpRight size={13} /></button></div> : view.mode === 'flow' && active ? <div className="inspector-content"><span className="badge">{active.kind}</span><h2 className="operation-title">{active.expression}</h2><p>{active.explanation}</p><div className="source-ref"><FileCode2 size={13} />{active.source.file}:{active.source.start_line}</div>{flow?.limitations.map((l, i) => <p className="notice" key={i}>{l}</p>)}<h4>INPUTS & OUTPUTS</h4><div className="metadata-row"><span>Reads</span><code>{active.reads.join(', ') || '—'}</code></div><div className="metadata-row"><span>Writes</span><code>{active.writes.join(', ') || '—'}</code></div><h4>SYMBOLIC VARIABLES <span>{variables.length}</span></h4>{variables.map(([name, value]) => <div className="variable" key={name}><strong>{name}</strong><small>{value.version}</small><code>{value.expression}</code><p>{value.literal !== null ? `Literal at definition: ${value.literal}` : 'Runtime value unavailable'}</p></div>)}{calls.length > 0 && <h4>CALLS IN THIS OPERATION</h4>}{calls.map(call => <div className="call-item" key={call.id}><strong>{call.metadata.expression}</strong><span className={`badge ${call.metadata.resolution}`}>{call.metadata.resolution}</span>{call.metadata.targets?.map(target => <div className="call-actions" key={target}><button onClick={() => select(target)}>Inspect {findName(target)}</button>{symbols.some(s => s.id === target && ['Function', 'Method'].includes(s.kind)) && <button onClick={() => void openFlow(target)}>Enter flow <ArrowUpRight size={12} /></button>}</div>)}</div>)}<button className="secondary full-width" onClick={() => select(view.selected!)}><Box size={14} />Inspect Object / Function</button></div> : details ? <div className="inspector-content"><div className="inspector-icon">{details.symbol.kind === 'Class' ? <Box size={23} /> : <Braces size={23} />}</div><span className="badge">{details.symbol.kind}{details.symbol.metadata.dataclass ? ' · dataclass' : ''}</span><h2>{details.symbol.name}</h2><div className="qualified">{details.symbol.qualified_name}</div><p>{details.symbol.docstring || 'No docstring declared.'}</p>{details.symbol.source && <div className="source-ref"><FileCode2 size={13} />{details.symbol.source.file}:{details.symbol.source.start_line}</div>}{details.symbol.signature && <code className="signature">{details.symbol.signature}</code>}{details.symbol.metadata.decorators?.length ? <p className="decorators">{details.symbol.metadata.decorators.map(d => `@${d}`).join(' ')}</p> : null}{['Function', 'Method'].includes(details.symbol.kind) && <button className="primary full-width" onClick={() => void openFlow(details.symbol.id)}><GitBranch size={15} />Explore Data Flow<ArrowUpRight size={14} /></button>}
      {details.symbol.metadata.bases?.length ? <><h4>INHERITS FROM</h4><p>{details.symbol.metadata.bases.join(', ')}</p></> : null}
      <h4>ATTRIBUTES <span>{attributes.length}</span></h4>{attributes.length ? attributes.map(a => <button className="attribute-row" key={a.id} onClick={() => { setSourceOverride(a.source); }}><span><i>a</i><strong>{a.name}</strong><small>{a.metadata.storage} {a.metadata.annotation ? `· ${a.metadata.annotation}` : ''}</small></span><code>{a.metadata.literal ?? a.metadata.expression ?? 'unknown'}</code></button>) : <p className="muted">No attributes declared in this scope.</p>}
      <h4>{details.symbol.kind === 'Module' ? 'DEFINITIONS' : 'METHODS'} <span>{methods.length}</span></h4>{methods.map(m => <button className="method-row" key={m.id} onClick={() => select(m.id)}><Braces size={13} /><span><strong>{m.name}</strong><small>{m.signature}</small></span><ArrowUpRight size={13} /></button>)}
      {details.children.some(c => c.kind === 'Parameter') && <><h4>PARAMETERS</h4>{details.children.filter(c => c.kind === 'Parameter').map(c => <div className="metadata-row" key={c.id}><strong>{c.name}</strong><code>{c.metadata.annotation || 'unannotated'}</code></div>)}</>}
      <h4>RELATIONSHIPS</h4>{details.relations.filter(r => r.kind !== 'CONTAINS').slice(0, 25).map(r => <button className="relation-row" key={r.id} onClick={() => { setRelation(r); setSourceOverride(r.provenance); }}><span>{r.kind.toLowerCase()} <strong>{findName(r.source === view.selected ? r.target : r.source)}</strong></span><small className={r.resolution}>{r.resolution}</small></button>)}{!details.relations.some(r => r.kind !== 'CONTAINS') && <p className="muted">No direct relations identified.</p>}</div> : <div className="empty-small">Select a symbol to inspect its source.</div>}</aside></div>
      <section className="source-panel"><div className="resize-handle horizontal" onPointerDown={e => resize(e, 'bottom')} /><div className="source-toolbar"><Code2 size={14} /><strong>SOURCE</strong><span>{sourceLocation?.file || 'Select a symbol'}</span><div className="mode-spacer" />{sourceLocation && <small>Lines {sourceLocation.start_line}–{sourceLocation.end_line}</small>}<span className="readonly"><Check size={11} />Read only</span></div><div className="source-editor"><SourceEditor source={source} location={sourceLocation} symbols={symbols} onSelect={select} light={light} /></div></section>
      <footer className="statusbar"><span><span className="status-dot" />Analysis ready</span><span>Python · AST</span><span className="mode-spacer" /><button onClick={() => setDiagnostics(!diagnostics)}>{summary.diagnostics.filter(d => d.severity !== 'info').length} warnings · Analysis notes</button><span>CodeMotion 0.1</span></footer>
      {diagnostics && <div className="diagnostic-panel"><div className="panel-heading">ANALYSIS NOTES<button aria-label="Close analysis notes" onClick={() => setDiagnostics(false)}><X size={14} /></button></div>{summary.diagnostics.map((d, i) => <article key={i}><span className="badge">{d.code}</span><p>{d.message}</p>{d.source && <button onClick={() => setSourceOverride(d.source)}>{d.source.file}:{d.source.start_line}</button>}</article>)}</div>}
    </>}
    {importOpen && <div className="modal-backdrop" onClick={() => setImportOpen(false)}><section role="dialog" aria-modal="true" aria-label="Import repository" className="import-modal" onClick={e => e.stopPropagation()}><button className="modal-close" aria-label="Close import" onClick={() => setImportOpen(false)}><X size={18} /></button><span className="eyebrow">BRING YOUR CODE</span><h2>Import a repository</h2><p>Python files are parsed locally. No scripts, hooks, or dependencies from the repository are executed.</p><button disabled={running} className="folder-drop" onClick={() => fileInput.current?.click()}><FolderOpen size={26} /><strong>Choose a local folder</strong><small>.py files and .gitignore · up to 20 MB</small></button><div className="divider">or a public GitHub repository</div><form onSubmit={e => { e.preventDefault(); void importGithub(); }}><label className="github-input"><GitBranch size={17} /><input aria-label="GitHub repository URL" placeholder="https://github.com/owner/repository" value={github} onChange={e => setGithub(e.target.value)} required /></label><button disabled={running} className="primary full-width" type="submit">Analyze repository <ArrowUpRight size={15} /></button></form><div className="divider">try a working example</div><div className="example-buttons">{['basic-functions', 'object-oriented', 'branching', 'loops', 'multi-module'].map(name => <button disabled={running} key={name} onClick={() => void importExample(name)}>{name.replaceAll('-', ' ')}</button>)}</div></section></div>}
  </div>;
}




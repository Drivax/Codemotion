'use client';
import { label } from '@/lib/labels';
import { useMemo, useState } from 'react';
import type { FileRecord, SymbolNode } from '@/lib/types';
function Highlight({ text, query }: { text: string; query: string }) {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  return !query || i < 0 ? <>{text}</> : <>{text.slice(0, i)}<mark>{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
}
export default function Explorer({ files, symbols, selected, onSelect, onFile, search, onSearch, expanded, onExpanded }: {
  files: FileRecord[]; symbols: SymbolNode[]; selected: string | null; onSelect: (id: string) => void;
  onFile: (path: string) => void; search: string; onSearch: (s: string) => void; expanded: string[]; onExpanded: (s: string[]) => void;
}) {
  const [limit, setLimit] = useState(100);
  const grouped = useMemo(() => {
    const map = new Map<string, SymbolNode[]>();
    for (const s of symbols) if (s.source && ['Class', 'Function', 'Method'].includes(s.kind)) {
      const list = map.get(s.source.file) || []; list.push(s); map.set(s.source.file, list);
    }
    return map;
  }, [symbols]);
  const searchIndex = useMemo(() => symbols.filter(s => s.source && ['Class', 'Function', 'Method', 'Module'].includes(s.kind)).map(symbol => ({ symbol, text: (symbol.qualified_name + ' ' + symbol.source!.file).toLowerCase() })), [symbols]);
  const matches = useMemo(() => { const query = search.toLowerCase(); return query ? searchIndex.filter(entry => entry.text.includes(query)).map(entry => entry.symbol) : []; }, [searchIndex, search]);
  const toggle = (path: string) => onExpanded(expanded.includes(path) ? expanded.filter(p => p !== path) : [...expanded, path]);
  const reveal = () => {
    const node = symbols.find(s => s.id === selected), file = node?.source?.file;
    if (!file) return;
    const ancestors: string[] = [];
    let parent = node.parent;
    while (parent) { ancestors.push('symbol:' + parent); parent = symbols.find(s => s.id === parent)?.parent || null; }
    onSearch(''); onExpanded([...new Set([...expanded, ...ancestors, ...file.split('/').map((_, i) => file.split('/').slice(0, i + 1).join('/'))])]);
    requestAnimationFrame(() => document.getElementById('tree-' + selected)?.scrollIntoView({ block: 'nearest' }));
  };
  const renderSymbols = (items: SymbolNode[], parent: string | null, indent = 0): React.ReactNode => items.filter(s => parent ? s.parent === parent : !items.some(p => p.id === s.parent)).map(s => {
    const children = items.some(n => n.parent === s.id), key = 'symbol:' + s.id;
    return <div key={s.id} style={{ paddingLeft: indent ? 12 : 0 }}><div className="symbol-tree-row">{children && <button aria-label={`${expanded.includes(key) ? 'Replier' : 'Déplier'} ${s.qualified_name}`} aria-expanded={expanded.includes(key)} onClick={() => toggle(key)}>{expanded.includes(key) ? '▾' : '▸'}</button>}<button id={'tree-' + s.id} title={s.qualified_name} className={`tree-symbol ${s.id === selected ? 'selected' : ''}`} onClick={() => onSelect(s.id)}><span>{s.kind === 'Class' ? '◇' : 'ƒ'}</span>{s.name}</button></div>{children && expanded.includes(key) && renderSymbols(items, s.id, indent + 1)}</div>;
  });
  const renderDirectory = (prefix: string, depth: number): React.ReactNode => {
    const entries = new Map<string, boolean>();
    for (const f of files) if (f.path.startsWith(prefix)) { const rest = f.path.slice(prefix.length), part = rest.split('/')[0]; entries.set(prefix + part, rest.includes('/')); }
    return [...entries].sort(([a, ad], [b, bd]) => Number(bd) - Number(ad) || a.localeCompare(b)).map(([path, isDir]) => <div key={path} className="explorer-entry" style={{ paddingLeft: depth ? 10 : 0 }}><div className="tree-file"><button aria-expanded={expanded.includes(path)} aria-label={`${expanded.includes(path) ? 'Replier' : 'Déplier'} ${path}`} onClick={() => toggle(path)}>{expanded.includes(path) ? '▾' : '▸'}</button><button title={path} onClick={() => isDir ? toggle(path) : onFile(path)}>{isDir ? '▱' : '▧'} {path.split('/').at(-1)}</button></div>{expanded.includes(path) && (isDir ? renderDirectory(path + '/', depth + 1) : renderSymbols(grouped.get(path) || [], null))}</div>);
  };
  return <><label className="search"><input aria-label="Rechercher des symboles" placeholder="Rechercher un symbole…" value={search} onChange={e => { onSearch(e.target.value); setLimit(100); }} />{search && <button aria-label="Effacer la recherche" onClick={() => onSearch('')}>×</button>}</label><div className="explorer-actions"><button onClick={() => onExpanded([])}>Tout replier</button><button onClick={reveal}>Révéler</button></div><div className="file-tree">{search ? <><p role="status">{matches.length} résultats</p>{matches.slice(0, limit).map(s => <button key={s.id} className={`search-result ${s.id === selected ? 'selected' : ''}`} onClick={() => onSelect(s.id)}><strong><Highlight text={s.name} query={search} /></strong><small>{label(s.kind)} · <Highlight text={s.source?.file || ''} query={search} />:{s.source?.start_line}</small></button>)}{!matches.length && <p>Aucun résultat. Essayez un nom de fonction ou un chemin.</p>}{matches.length > limit && <button onClick={() => setLimit(n => n + 100)}>Afficher 100 résultats de plus</button>}</> : renderDirectory('', 0)}</div></>;
}

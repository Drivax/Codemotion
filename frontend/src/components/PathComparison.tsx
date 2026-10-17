'use client';
import { operationText } from '@/lib/labels';
import { useState } from 'react';
import type { Flow, SourceLocation } from '@/lib/types';
import type { Playback } from '@/lib/playback';
import { comparePaths, pathKey, readPaths, type NamedPath } from '@/lib/paths';
import Dialog from './Dialog';
export default function PathComparison({ snapshot, flow, playback, onRestore, onSource, onClose }: { snapshot: string; flow: Flow; playback: Playback; onRestore: (p: Playback) => void; onSource: (s: SourceLocation) => void; onClose: () => void }) {
  const key = pathKey(snapshot, flow.function_id);
  const [paths, setPaths] = useState(() => readPaths(key, flow));
  const [name, setName] = useState(''), [error, setError] = useState('');
  const [left, setLeft] = useState(''), [right, setRight] = useState('');
  const persist = (next: NamedPath[]) => { try { localStorage.setItem(key, JSON.stringify(next)); setPaths(next); setError(''); } catch { setError('Stockage local plein ou indisponible ; aucun parcours enregistré.'); } };
  const a = paths.find(p => p.name === left), b = paths.find(p => p.name === right);
  const diff = a && b ? comparePaths(flow, a.playback, b.playback) : null;
  return <Dialog title="Comparer deux parcours" onClose={onClose}><div className="insights path-comparison">
    <p>Parcours hypothétiques de la même fonction et du même snapshot. Les répétitions de boucle sont comptées ; aucune valeur runtime n’est calculée.</p>
    <form onSubmit={e => { e.preventDefault(); const title = name.trim().slice(0, 80); if (!title) return; persist([{ name: title, playback: { trail: playback.trail.slice(0, playback.index + 1), index: playback.index }, savedAt: new Date().toISOString() }, ...paths.filter(p => p.name !== title)].slice(0, 20)); setName(''); }}><input aria-label="Nom du parcours à comparer" placeholder="Ex. Branche acceptée" maxLength={80} value={name} onChange={e => setName(e.target.value)} required /><button className="secondary" type="submit">Enregistrer le parcours actuel</button></form>
    <p>20 parcours maximum par fonction. Un nom existant est remplacé ; seules les étapes jusqu’à l’étape active sont enregistrées.</p>{error && <p role="alert">{error}</p>}
    {paths.map(p => <article key={p.name}><strong>{p.name}</strong> · {p.playback.trail.length} étapes <button onClick={() => { onRestore(p.playback); onClose(); }}>Restaurer {p.name}</button><button aria-label={`Supprimer le parcours ${p.name}`} onClick={() => persist(paths.filter(item => item.name !== p.name))}>Supprimer</button></article>)}
    <div className="comparison-selectors">{(['A','B'] as const).map(side => <label key={side}>Parcours {side}<select aria-label={`Parcours ${side}`} value={side === 'A' ? left : right} onChange={e => side === 'A' ? setLeft(e.target.value) : setRight(e.target.value)}><option value="">Choisir un parcours</option>{paths.map(p => <option key={p.name}>{p.name}</option>)}</select></label>)}</div>
    {diff && <><h3>Comparaison : {a!.name} / {b!.name}</h3><p>{diff.sharedPrefix} étapes initiales communes · A : {diff.aLength} étapes · B : {diff.bLength} étapes.</p><h3>Opérations différentes</h3>{!diff.operations.length && <p>Mêmes opérations et mêmes nombres de passages. Le préfixe commun permet de repérer un ordre différent.</p>}{diff.operations.map(({ operation, a, b }) => <button className="evidence" key={operation.id} onClick={() => onSource(operation.source)}>{operationText(operation)}<small>L{operation.source.start_line} · passages A : {a} · B : {b}</small></button>)}<h3>Dernières définitions traversées</h3><div className="comparison-table"><table><thead><tr><th>Variable</th><th>Parcours A</th><th>Parcours B</th></tr></thead><tbody>{diff.variables.map(v => <tr key={v.name}><th>{v.name}{v.changed ? ' ≠' : ' ='}</th><td>{v.a}</td><td>{v.b}</td></tr>)}</tbody></table></div></>}
  </div></Dialog>;
}

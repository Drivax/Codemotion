'use client';
import { operationText, label } from '@/lib/labels';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { advance, choices, initialPlayback, previousDecision, type Playback } from '@/lib/playback';
import { matchesBreakpoint, readBreakpoints, runToStop } from '@/lib/breakpoints';
import type { Flow } from '@/lib/types';
export default function Player({ flow, playback, onChange, pauseKey = flow.function_id, storageKey = flow.function_id }: { flow: Flow; playback: Playback; onChange: (p: Playback) => void; pauseKey?: string; storageKey?: string }) {
  const breakpointKey = `codemotion.breakpoints.v1:${storageKey}`;
  const [rules, setRules] = useState(() => readBreakpoints(breakpointKey));
  const [pending, setPending] = useState<string | null>(null);
  const [storageError, setStorageError] = useState('');
  const skip = useRef<string | null>(null);
  const updateRules = (next: typeof rules) => { setRules(next); setPending(null); setRequest(null); try { localStorage.setItem(breakpointKey, JSON.stringify(next)); setStorageError(''); } catch { setStorageError('Points d’arrêt actifs mais non sauvegardés : stockage indisponible.'); } };
  const resume = () => { skip.current = pending; setPending(null); setPlaying(true); };
  const [request, setRequest] = useState<string | null>(null);
  const playing = request === pauseKey;
  const setPlaying = useCallback((value: boolean | ((previous: boolean) => boolean)) => {
    setRequest(previous => (typeof value === 'function' ? value(previous === pauseKey) : value) ? pauseKey : null);
  }, [pauseKey]);
  const [speed, setSpeed] = useState(1);
  const options = choices(flow, playback);
  const current = flow.operations.find(o => o.id === playback.trail[playback.index]);
  const previousBranch = previousDecision(flow, playback);
  const canReplay = playback.index < playback.trail.length - 1;
  const capped = playback.index >= 1999;
  const atEnd = !options.length && playback.index === playback.trail.length - 1;
  const needsChoice = options.length > 1 && playback.index === playback.trail.length - 1;
  useEffect(() => {
    if (!playing || capped || needsChoice || atEnd) return;
    const timer = window.setTimeout(() => {
      if (document.querySelector('dialog[open]')) { setPlaying(false); return; }
      const next = advance(flow, playback);
      const target = next.trail[next.index];
      if (next !== playback && target !== skip.current && matchesBreakpoint(flow.operations.find(o => o.id === target), rules)) { setPending(target); setPlaying(false); return; }
      skip.current = null;
      if (next === playback) setPlaying(false); else onChange(next);
    }, 1000 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, speed, flow, playback, onChange, capped, needsChoice, atEnd, setPlaying, rules]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
      if ((event.target as HTMLElement).closest?.('input, textarea, select, .monaco-editor, button, [contenteditable=true], [role=slider]')) return;
      if (event.key === ' ' && !capped && !needsChoice && !atEnd) { event.preventDefault(); if (playing) setPlaying(false); else { skip.current = pending; setPending(null); setPlaying(true); } }
      if (event.key === 'ArrowRight') { event.preventDefault(); setPlaying(false); setPending(null); onChange(advance(flow, playback)); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); setPlaying(false); onChange({ ...playback, index: Math.max(0, playback.index - 1) }); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [flow, playback, onChange, capped, needsChoice, atEnd, setPlaying, playing, pending]);
  const stop = (p: Playback) => { setPlaying(false); setPending(null); skip.current = null; onChange(p); };
  const isPlaying = playing && !needsChoice && !atEnd && !capped;
  return <div className="player-wrap">
    <div className="player-context"><span title={current?.expression}><strong>Étape {playback.index + 1}</strong> · {current ? operationText(current) : 'Parcours statique'}</span><small>Code non exécuté</small></div>
    <details className="breakpoints"><summary>Points d’arrêt statiques ({rules.operations.length}{rules.calls ? ' + appels' : ''}{rules.writes ? ' + écritures' : ''})</summary>
      <p>La lecture et l’avance rapide s’arrêtent avant l’opération. Lire reprend une fois ; Étape suivante franchit volontairement l’arrêt. Aucun code n’est exécuté.</p>
      <label><input type="checkbox" checked={rules.calls} onChange={e => updateRules({ ...rules, calls: e.target.checked })} />Avant les appels</label>
      <label><input type="checkbox" checked={rules.writes} onChange={e => updateRules({ ...rules, writes: e.target.checked })} />Avant les écritures</label>
      <label>Variable (vide : toutes)<input value={rules.variable} onChange={e => updateRules({ ...rules, variable: e.target.value })} /></label>
      <label>Opération<select aria-label="Ajouter un point d’arrêt" value="" onChange={e => { if (e.target.value) updateRules({ ...rules, operations: [...new Set([...rules.operations, e.target.value])] }); }}><option value="">Choisir une opération…</option>{flow.operations.map(o => <option key={o.id} value={o.id}>L{o.source.start_line} · {operationText(o)}</option>)}</select></label>
      {rules.operations.map(id => <button key={id} onClick={() => updateRules({ ...rules, operations: rules.operations.filter(x => x !== id) })}>Retirer : {flow.operations.find(o => o.id === id)?.expression || 'Opération absente'}</button>)}
      {storageError && <p role="alert">{storageError}</p>}
    </details>
    {pending && <p role="status" className="notice">Point d’arrêt avant : {flow.operations.find(o => o.id === pending)?.expression}. Cette opération n’a pas encore été ajoutée au parcours.</p>}
    <div className="player-navigation">
      <button disabled={previousBranch === playback} onClick={() => stop(previousBranch)}>Décision précédente</button>
      <label>Parcours <select aria-label="Aller à une étape du parcours" value={playback.index} onChange={e => stop({ ...playback, index: Number(e.target.value) })}>{playback.trail.map((id, index) => {
        const operation = flow.operations.find(o => o.id === id);
        const next = playback.trail[index + 1];
        const branch = flow.edges.find(e => e.kind === 'control' && e.source === id && e.target === next)?.label;
        return <option key={index} value={index}>{index + 1}. {(operation ? operationText(operation) : id)}{branch ? ` → ${label(branch)}` : ''}</option>;
      })}</select></label>
      {canReplay && <small>La suite déjà choisie est conservée.</small>}
    </div>
    {options.length > 1 && <div className="branch-choice"><span><strong>{needsChoice ? 'Choisir une branche' : 'Changer de branche'}</strong> · choix hypothétique, condition non évaluée</span>{options.map((o, i) => <button key={`${o.target}-${i}`} onClick={() => stop(advance(flow, playback, o.target))}>{label(o.label)}</button>)}</div>}
    {atEnd && <div className="branch-choice" role="status">Parcours terminé · revenez à une décision pour explorer une autre branche.</div>}
    <div className="player"><span className="player-state" role="status">{capped ? 'Limite de 2 000 étapes' : needsChoice ? 'Choix requis' : atEnd ? 'Terminé' : isPlaying ? 'Lecture' : 'Pause'}</span><span className="static-label"><span className="status-dot" />FLUX STATIQUE</span>
      <button title="Revenir au début sans effacer le parcours" aria-label="Revenir au début" onClick={() => stop({ ...playback, index: 0 })}><SkipBack size={16} /></button>
      <button title="Étape précédente (flèche gauche hors champ de saisie)" aria-label="Étape précédente" disabled={playback.index === 0} onClick={() => stop({ ...playback, index: playback.index - 1 })}><ChevronLeft size={18} /></button>
      <button className="play-button" title={isPlaying ? 'Mettre en pause (Espace)' : 'Lire le parcours (Espace)'} aria-label={isPlaying ? 'Pause' : 'Lire'} disabled={capped || needsChoice || !options.length} onClick={() => isPlaying ? setPlaying(false) : resume()}>{isPlaying ? <Pause size={17} /> : <Play size={17} />}{isPlaying ? 'Pause' : 'Lire'}</button>
      <button title="Étape suivante (flèche droite hors champ de saisie)" aria-label="Étape suivante" disabled={capped || needsChoice || !options.length} onClick={() => stop(advance(flow, playback))}><ChevronRight size={18} /></button>
      <button title="Avancer à la prochaine décision ou à la fin" aria-label="Avancer à la prochaine décision ou à la fin" disabled={capped || needsChoice || atEnd} onClick={() => { const result = runToStop(flow, playback, rules, pending || undefined); stop(result.playback); setPending(result.pending); }}><SkipForward size={16} /></button>
      <input aria-label="Chronologie du parcours" aria-valuetext={`Étape ${playback.index + 1} sur ${playback.trail.length} : ${current?.expression || ''}`} type="range" min={0} max={Math.max(0, playback.trail.length - 1)} value={playback.index} onChange={e => stop({ ...playback, index: Number(e.target.value) })} />
      <span className="step-count">{playback.index + 1} / {playback.trail.length} étapes · {flow.operations.length} opérations</span>
      <select aria-label="Vitesse de lecture" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select>
      <button title="Effacer le parcours et recommencer" aria-label="Recommencer le parcours" onClick={() => stop(initialPlayback(flow))}><RotateCcw size={14} /></button>
    </div>
  </div>;
}

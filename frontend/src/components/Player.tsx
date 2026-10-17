'use client';
import { operationText, label } from '@/lib/labels';
import { useCallback, useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { advance, choices, initialPlayback, previousDecision, untilDecision, type Playback } from '@/lib/playback';
import type { Flow } from '@/lib/types';
export default function Player({ flow, playback, onChange, pauseKey = flow.function_id }: { flow: Flow; playback: Playback; onChange: (p: Playback) => void; pauseKey?: string }) {
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
      if (next === playback) setPlaying(false); else onChange(next);
    }, 1000 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, speed, flow, playback, onChange, capped, needsChoice, atEnd, setPlaying]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
      if ((event.target as HTMLElement).closest?.('input, textarea, select, .monaco-editor, button, [contenteditable=true], [role=slider]')) return;
      if (event.key === ' ' && !capped && !needsChoice && !atEnd) { event.preventDefault(); setPlaying(p => !p); }
      if (event.key === 'ArrowRight') { event.preventDefault(); setPlaying(false); onChange(advance(flow, playback)); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); setPlaying(false); onChange({ ...playback, index: Math.max(0, playback.index - 1) }); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [flow, playback, onChange, capped, needsChoice, atEnd, setPlaying]);
  const stop = (p: Playback) => { setPlaying(false); onChange(p); };
  const isPlaying = playing && !needsChoice && !atEnd && !capped;
  return <div className="player-wrap">
    <div className="player-context"><span title={current?.expression}><strong>Étape {playback.index + 1}</strong> · {current ? operationText(current) : 'Parcours statique'}</span><small>Code non exécuté</small></div>
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
      <button className="play-button" title={isPlaying ? 'Mettre en pause (Espace)' : 'Lire le parcours (Espace)'} aria-label={isPlaying ? 'Pause' : 'Lire'} disabled={capped || needsChoice || !options.length} onClick={() => setPlaying(!isPlaying)}>{isPlaying ? <Pause size={17} /> : <Play size={17} />}{isPlaying ? 'Pause' : 'Lire'}</button>
      <button title="Étape suivante (flèche droite hors champ de saisie)" aria-label="Étape suivante" disabled={capped || needsChoice || !options.length} onClick={() => stop(advance(flow, playback))}><ChevronRight size={18} /></button>
      <button title="Avancer à la prochaine décision ou à la fin" aria-label="Avancer à la prochaine décision ou à la fin" disabled={capped || needsChoice || atEnd} onClick={() => stop(untilDecision(flow, playback))}><SkipForward size={16} /></button>
      <input aria-label="Chronologie du parcours" aria-valuetext={`Étape ${playback.index + 1} sur ${playback.trail.length} : ${current?.expression || ''}`} type="range" min={0} max={Math.max(0, playback.trail.length - 1)} value={playback.index} onChange={e => stop({ ...playback, index: Number(e.target.value) })} />
      <span className="step-count">{playback.index + 1} / {playback.trail.length} étapes · {flow.operations.length} opérations</span>
      <select aria-label="Vitesse de lecture" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select>
      <button title="Effacer le parcours et recommencer" aria-label="Recommencer le parcours" onClick={() => stop(initialPlayback(flow))}><RotateCcw size={14} /></button>
    </div>
  </div>;
}

'use client';
import { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { advance, choices, initialPlayback, untilDecision, type Playback } from '@/lib/playback';
import type { Flow } from '@/lib/types';
export default function Player({ flow, playback, onChange }: { flow: Flow; playback: Playback; onChange: (p: Playback) => void }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const options = choices(flow, playback);
  const capped = playback.index >= 1999;
  const atEnd = !options.length && playback.index === playback.trail.length - 1;
  const needsChoice = options.length > 1 && playback.index === playback.trail.length - 1;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      const next = advance(flow, playback);
      if (next === playback) setPlaying(false); else onChange(next);
    }, 1000 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, speed, flow, playback, onChange]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select, .monaco-editor, button')) return;
      if (event.key === ' ') { event.preventDefault(); setPlaying(p => !p); }
      if (event.key === 'ArrowRight') onChange(advance(flow, playback));
      if (event.key === 'ArrowLeft') onChange({ ...playback, index: Math.max(0, playback.index - 1) });
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [flow, playback, onChange]);
  const stop = (p: Playback) => { setPlaying(false); onChange(p); };
  return <div className="player-wrap">
    {options.length > 1 && <div className="branch-choice"><span><strong>{needsChoice ? 'Choose a path' : 'Explore another path'}</strong> · hypothetical, not evaluated</span>{options.map((o, i) => <button key={`${o.target}-${i}`} onClick={() => stop(advance(flow, playback, o.target))}>{o.label}</button>)}</div>}
    {atEnd && <div className="branch-choice" role="status">End of this path · use Previous step or Reset playback to explore again.</div>}
    <div className="player"><span className="player-state" role="status">{capped ? 'Limite de 2 000 étapes' : needsChoice ? 'Choix requis' : atEnd ? 'Terminé' : playing ? 'Lecture' : 'Pause'}</span><span className="static-label"><span className="status-dot" />STATIC FLOW</span>
      <button title="Start" aria-label="Start" onClick={() => stop(initialPlayback(flow))}><SkipBack size={16} /></button>
      <button title="Previous step" aria-label="Previous step" disabled={playback.index === 0} onClick={() => stop({ ...playback, index: playback.index - 1 })}><ChevronLeft size={18} /></button>
      <button className="play-button" title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'} disabled={capped || needsChoice || !options.length} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
      <button title="Next step" aria-label="Next step" disabled={capped || needsChoice || !options.length} onClick={() => stop(advance(flow, playback))}><ChevronRight size={18} /></button>
      <button title="Advance to next decision or end" aria-label="Advance to next decision or end" disabled={capped || needsChoice || atEnd} onClick={() => stop(untilDecision(flow, playback))}><SkipForward size={16} /></button>
      <input aria-label="Playback timeline" type="range" min={0} max={Math.max(0, playback.trail.length - 1)} value={playback.index} onChange={e => stop({ ...playback, index: Number(e.target.value) })} />
      <span className="step-count">{playback.index + 1} / {playback.trail.length} étapes · {flow.operations.length} opérations</span>
      <select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select>
      <button aria-label="Reset playback" onClick={() => stop(initialPlayback(flow))}><RotateCcw size={14} /></button>
    </div>
  </div>;
}

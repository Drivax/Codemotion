import type { Flow, FlowLink } from './types';
export interface Playback { trail: string[]; index: number }
export const initialPlayback = (flow: Flow): Playback => ({ trail: [flow.entry], index: 0 });
export function choices(flow: Flow, playback: Playback): FlowLink[] {
  return flow.edges.filter(e => e.kind === 'control' && e.source === playback.trail[playback.index]);
}
export function advance(flow: Flow, playback: Playback, target?: string): Playback {
  if (!target && playback.index < playback.trail.length - 1) return { ...playback, index: playback.index + 1 };
  const options = choices(flow, playback);
  if ((!target && options.length !== 1) || !options.length) return playback;
  const next = target ? options.find(o => o.target === target) : options[0];
  if (!next || playback.trail.length >= 2000) return playback;
  return { trail: [...playback.trail.slice(0, playback.index + 1), next.target], index: playback.index + 1 };
}
export function untilDecision(flow: Flow, playback: Playback): Playback {
  let current = playback;
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const id = current.trail[current.index];
    if (seen.has(id) || choices(flow, current).length !== 1) break;
    seen.add(id);
    const next = advance(flow, current);
    if (next === current) break;
    current = next;
  }
  return current;
}
export function validPlayback(flow: Flow, playback: unknown): playback is Playback {
  if (!playback || typeof playback !== 'object') return false;
  const p = playback as Playback;
  return Array.isArray(p.trail) && p.trail.length > 0 && p.trail.length <= 2000 && p.trail[0] === flow.entry && Number.isInteger(p.index) && p.index >= 0 && p.index < p.trail.length && p.trail.every((id, i) => flow.operations.some(o => o.id === id) && (i === 0 || flow.edges.some(e => e.kind === 'control' && e.source === p.trail[i - 1] && e.target === id)));
}

import type { Flow } from './types';
import { validPlayback, type Playback } from './playback';
export interface NamedPath { name: string; playback: Playback; savedAt: string }
export const pathKey = (snapshot: string, functionId: string) => `codemotion.paths.v1:${snapshot}:${functionId}`;
export function readPaths(key: string, flow: Flow): NamedPath[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw.filter((p): p is NamedPath => !!p && typeof p.name === 'string' && p.name.length <= 80 && typeof p.savedAt === 'string' && validPlayback(flow, p.playback)).slice(0, 20) : [];
  } catch { return []; }
}
export function comparePaths(flow: Flow, a: Playback, b: Playback) {
  const left = a.trail.slice(0, a.index + 1), right = b.trail.slice(0, b.index + 1);
  let sharedPrefix = 0;
  while (sharedPrefix < left.length && sharedPrefix < right.length && left[sharedPrefix] === right[sharedPrefix]) sharedPrefix++;
  const counts = (trail: string[]) => { const map = new Map<string, number>(); trail.forEach(id => map.set(id, (map.get(id) || 0) + 1)); return map; };
  const ac = counts(left), bc = counts(right);
  const operations = flow.operations.filter(o => ac.get(o.id) !== bc.get(o.id)).map(operation => ({ operation, a: ac.get(operation.id) || 0, b: bc.get(operation.id) || 0 }));
  const definitions = (trail: string[]) => { const map = new Map<string, string>(); for (const id of trail) { const op = flow.operations.find(o => o.id === id); op?.writes.forEach(name => map.set(name, `${op.source.file}:${op.source.start_line} · ${op.expression}`)); } return map; };
  const ad = definitions(left), bd = definitions(right);
  const variables = [...new Set([...ad.keys(), ...bd.keys()])].sort().map(name => ({ name, a: ad.get(name) || 'Non définie sur ce parcours', b: bd.get(name) || 'Non définie sur ce parcours', changed: ad.get(name) !== bd.get(name) }));
  return { sharedPrefix, operations, variables, aLength: left.length, bLength: right.length };
}

import type { Flow, Operation } from './types';
import { advance, choices, type Playback } from './playback';
export interface Breakpoints { calls: boolean; writes: boolean; variable: string; operations: string[] }
export const emptyBreakpoints: Breakpoints = { calls: false, writes: false, variable: '', operations: [] };
export function matchesBreakpoint(op: Operation | undefined, rules: Breakpoints) {
  return !!op && (rules.operations.includes(op.id) || (rules.calls && (op.calls.length > 0 || op.kind === 'call')) || (rules.writes && op.writes.length > 0 && (!rules.variable || op.writes.includes(rules.variable))));
}
export function readBreakpoints(key: string): Breakpoints {
  try { const r = JSON.parse(localStorage.getItem(key) || 'null'); if (r && typeof r.calls === 'boolean' && typeof r.writes === 'boolean' && typeof r.variable === 'string' && Array.isArray(r.operations) && r.operations.length <= 2000 && r.operations.every((id: unknown) => typeof id === 'string')) return r; } catch { /* Invalid local data is ignored; no code is evaluated. */ }
  return { ...emptyBreakpoints, operations: [] };
}
export function runToStop(flow: Flow, playback: Playback, rules: Breakpoints, skip?: string) {
  let current = playback;
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const id = current.trail[current.index];
    if (seen.has(id) || choices(flow, current).length !== 1) break;
    seen.add(id);
    const next = advance(flow, current);
    if (next === current) break;
    const target = next.trail[next.index];
    if (target !== skip && matchesBreakpoint(flow.operations.find(o => o.id === target), rules)) return { playback: current, pending: target };
    skip = undefined;
    current = next;
  }
  return { playback: current, pending: null };
}

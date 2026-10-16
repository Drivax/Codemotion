import { describe, expect, it } from 'vitest';
import { advance, choices, initialPlayback, untilDecision, validPlayback, previousDecision } from './playback';
import type { Flow } from './types';
export const fixture: Flow = { function_id: 'f', entry: 'input', operations: [], limitations: [], edges: [
  { source: 'input', target: 'condition', kind: 'control', label: '' },
  { source: 'condition', target: 'yes', kind: 'control', label: 'True' },
  { source: 'condition', target: 'no', kind: 'control', label: 'False' },
  { source: 'yes', target: 'exit', kind: 'control', label: '' },
  { source: 'no', target: 'exit', kind: 'control', label: '' },
  { source: 'input', target: 'exit', kind: 'data', label: 'x' },
] };
describe('hypothetical path playback', () => {
  it('never chooses a branch automatically', () => {
    const start = initialPlayback(fixture);
    const branch = advance(fixture, start);
    expect(branch.trail).toEqual(['input', 'condition']);
    expect(advance(fixture, branch)).toBe(branch);
    expect(choices(fixture, branch)).toHaveLength(2);
  });
  it('branches explicitly and restores previous history', () => {
    const branch = untilDecision(fixture, initialPlayback(fixture));
    const yes = advance(fixture, branch, 'yes');
    expect(yes.trail).toEqual(['input', 'condition', 'yes']);
    const no = advance(fixture, { ...yes, index: 1 }, 'no');
    expect(no.trail).toEqual(['input', 'condition', 'no']);
    expect(advance(fixture, { ...yes, index: 1 }).index).toBe(2);
  });
  it('ignores data links for control progression and stops at exit', () => {
    const yes = advance(fixture, untilDecision(fixture, initialPlayback(fixture)), 'yes');
    const end = untilDecision(fixture, yes);
    expect(end.trail.at(-1)).toBe('exit');
    expect(advance(fixture, end)).toBe(end);
  });
  it('does not unroll cycles indefinitely', () => {
    const loop: Flow = { ...fixture, entry: 'body', edges: [{ source: 'body', target: 'body', kind: 'control', label: '' }] };
    expect(untilDecision(loop, initialPlayback(loop)).trail).toHaveLength(2);
  });
  it('rejects arbitrary branch destinations', () => {
    const start = initialPlayback(fixture);
    expect(advance(fixture, start, 'fake')).toBe(start);
  });
});

it('rejects a restored trail that jumps across a data edge', () => {
  const flow = { ...fixture, operations: ['input', 'condition', 'yes', 'no', 'exit'].map(id => ({ id })) } as Flow;
  expect(validPlayback(flow, { trail: ['input', 'exit'], index: 1 })).toBe(false);
  expect(validPlayback(flow, { trail: ['input', 'condition', 'yes', 'exit'], index: 2 })).toBe(true);
  expect(validPlayback(flow, { trail: ['input'], index: 10 })).toBe(false);
});

it('allows replacing a branch in a full history without exceeding the cap', () => {
  const full = { trail: ['input', 'condition', ...Array<string>(1998).fill('yes')], index: 1 };
  expect(advance(fixture, full, 'no')).toEqual({ trail: ['input', 'condition', 'no'], index: 2 });
  const loop: Flow = { ...fixture, edges: [{ source: 'yes', target: 'yes', kind: 'control', label: '' }] };
  const end = { ...full, index: 1999 };
  expect(advance(loop, end)).toBe(end);
});
it('returns to the previous decision while preserving the recorded future', () => {
  const path = { trail: ['input', 'condition', 'yes', 'exit'], index: 3 };
  expect(previousDecision(fixture, path)).toEqual({ ...path, index: 1 });
  expect(previousDecision(fixture, { ...path, index: 1 }).index).toBe(1);
});

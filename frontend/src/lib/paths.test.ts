import { describe, expect, it } from 'vitest';
import type { Flow } from './types';
import { comparePaths, pathKey, readPaths } from './paths';
import { aroundOperation } from './flow-view';
const source = { file: 'main.py', start_line: 1, end_line: 1, start_column: 0, end_column: 1 };
const flow: Flow = { function_id: 'f', entry: 'entry', limitations: [], operations: ['entry','choice','yes','no','exit','remote'].map(id => ({ id, kind: 'assignment', explanation: '', expression: id === 'yes' ? 'x = 1' : id === 'no' ? 'x = 2' : id, source, reads: [], writes: ['yes','no'].includes(id) ? ['x'] : [], definitions: {}, literal: null, calls: [] })), edges: [
  { source: 'entry', target: 'choice', kind: 'control', label: '' }, { source: 'choice', target: 'yes', kind: 'control', label: 'True' }, { source: 'choice', target: 'no', kind: 'control', label: 'False' }, { source: 'yes', target: 'exit', kind: 'control', label: '' }, { source: 'no', target: 'exit', kind: 'control', label: '' }, { source: 'remote', target: 'choice', kind: 'data', label: 'x' },
] };
describe('named path comparison', () => {
  it('distinguishes branch definitions and counts repeated operations', () => {
    const a = { trail: ['entry','choice','yes','exit'], index: 3 }, b = { trail: ['entry','choice','no','exit'], index: 3 };
    const diff = comparePaths(flow, a, b);
    expect(diff.sharedPrefix).toBe(2);
    expect(diff.operations.map(item => item.operation.id)).toEqual(['yes','no']);
    expect(diff.variables[0]).toMatchObject({ name: 'x', changed: true });
    expect(diff.variables[0].a).toContain('x = 1'); expect(diff.variables[0].b).toContain('x = 2');
    expect(comparePaths(flow, a, { ...a, trail: [...a.trail, 'yes'], index: 4 }).operations[0]).toMatchObject({ a: 1, b: 2 });
  });
  it('loads only valid paths in the matching snapshot and function', () => {
    const key = pathKey('snapshot', 'f');
    localStorage.setItem(key, JSON.stringify([{ name: 'A', savedAt: '', playback: { trail: ['entry','choice','yes'], index: 2 } }, { name: 'invalid', savedAt: '', playback: { trail: ['entry','remote'], index: 1 } }]));
    expect(readPaths(key, flow).map(p => p.name)).toEqual(['A']);
    expect(readPaths(pathKey('other', 'f'), flow)).toEqual([]);
  });
});
it('keeps both branch alternatives without following distant data links', () => {
  const nearby = aroundOperation(flow, 'choice', 1);
  expect(nearby.operations.map(o => o.id)).toEqual(['entry','choice','yes','no']);
  expect(nearby.edges.every(e => e.kind === 'control')).toBe(true);
  expect(flow.operations).toHaveLength(6);
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { createElement } from 'react';
import Player from '../components/Player';
import { emptyBreakpoints, matchesBreakpoint, runToStop } from './breakpoints';
import { parseBackup, importBackup } from './backup';
import { savedPathCompatibility } from './version-paths';
import type { Flow, Operation } from './types';
const operation = (id: string, kind: string, writes: string[] = []): Operation => ({ id, kind, writes, reads: [], calls: kind === 'call' ? ['callee'] : [], definitions: {}, expression: id, source: { file: 'a.py', start_line: 1, end_line: 1, start_column: 0, end_column: 1 }, literal: null, explanation: '' });
const flow: Flow = { function_id: 'f', entry: 'a', operations: [operation('a', 'input'), operation('b', 'assignment', ['x']), operation('c', 'call'), operation('d', 'exit')], edges: ['a', 'b', 'c'].map((source, i) => ({ source, target: ['b', 'c', 'd'][i], kind: 'control', label: '' })), limitations: [] };
beforeEach(() => localStorage.clear());
describe('static breakpoints', () => {
  it('stops before writes, excludes the pending operation and resumes once', () => {
    const rules = { ...emptyBreakpoints, writes: true, variable: 'x' };
    const first = runToStop(flow, { trail: ['a'], index: 0 }, rules);
    expect(first).toEqual({ playback: { trail: ['a'], index: 0 }, pending: 'b' });
    expect(runToStop(flow, first.playback, rules, first.pending!).playback.trail).toEqual(['a', 'b', 'c', 'd']);
    expect(matchesBreakpoint(flow.operations[1], { ...rules, variable: 'y' })).toBe(false);
  });
  it('autoplay pauses before a call and resume crosses the stop', () => {
    vi.useFakeTimers();
    try {
      const change = vi.fn();
      render(createElement(Player, { flow, playback: { trail: ['a', 'b'], index: 1 }, onChange: change }));
      fireEvent.click(screen.getByLabelText('Avant les appels'));
      fireEvent.click(screen.getByRole('button', { name: 'Lire' }));
      act(() => vi.advanceTimersByTime(1100));
      expect(change).not.toHaveBeenCalled();
      expect(screen.getByText(/Point d’arrêt avant : c/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Lire' }));
      act(() => vi.advanceTimersByTime(1100));
      expect(change).toHaveBeenLastCalledWith({ trail: ['a', 'b', 'c'], index: 2 });
    } finally { vi.useRealTimers(); }
  });
});
const snapshot = 'a'.repeat(64), repository = snapshot.slice(0, 24);
const session = { format: 1 as const, repository, snapshot, title: 'Travail', savedAt: new Date().toISOString(), state: { view: { mode: 'objects', selected: null, flowId: null, playback: null } } };
const backup = () => ({ format: 'codemotion-backup', version: 1, sessions: [session], storage: {}, snapshots: [] });
describe('session backups', () => {
  it('rejects malformed metadata before writing', () => {
    expect(() => parseBackup(JSON.stringify({ ...backup(), version: 2 }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...backup(), sessions: [{ ...session, state: {} }] }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...backup(), storage: { unrelated: '[]' } }))).toThrow();
    expect(localStorage.length).toBe(0);
  });
  it('merges without replacing an existing session', async () => {
    localStorage.setItem('codemotion.sessions.v1', JSON.stringify([{ ...session, savedAt: 'older' }]));
    await importBackup({ size: 100, text: async () => JSON.stringify(backup()) } as File);
    const sessions = JSON.parse(localStorage.getItem('codemotion.sessions.v1')!);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].savedAt).toBe('older');
    expect(sessions[1].title).toContain('importé');
  });
  it('checks every caller frame when comparing saved sessions', () => {
    localStorage.setItem('codemotion.sessions.v1', JSON.stringify([{ ...session, state: { view: { flowId: 'callee' }, stack: [{ flowId: 'caller' }] } }]));
    const rows = savedPathCompatibility(snapshot, [{ before_id: 'callee', after_id: 'callee', name: 'callee', compatible: true, reason: 'Identique' }, { before_id: 'caller', after_id: null, name: 'caller', compatible: false, reason: 'Supprimée' }]);
    expect(rows[0].compatible).toBe(false);
    expect(rows[0].reason).toContain('caller');
  });
});

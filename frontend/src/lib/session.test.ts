import { beforeEach, expect, it } from 'vitest';
import { readSessions, saveSession, renameSession, removeSession, validateSessionState, type StoredSession } from './session';
const sample: StoredSession = { format: 1, repository: 'r', snapshot: 'hash', title: 'Path', savedAt: '2026-10-13', state: { selected: 'function' } };
beforeEach(() => localStorage.clear());
it('restores metadata, renames atomically and removes only the chosen session', () => {
  saveSession(sample); saveSession({ ...sample, repository: 'other' });
  renameSession('r', 'Path', 'Renamed');
  expect(readSessions().map(s => s.title)).toEqual(['Renamed', 'Path']);
  removeSession('r', 'Renamed'); expect(readSessions()[0].repository).toBe('other');
});
it('rejects corrupt storage and unknown versions', () => {
  localStorage.setItem('codemotion.sessions.v1', '{'); expect(readSessions()).toEqual([]);
  localStorage.setItem('codemotion.sessions.v1', JSON.stringify([{ ...sample, format: 9 }, sample])); expect(readSessions()).toEqual([sample]);
});
it('bounds saved metadata and replaces a session with the same name', () => {
  for (let i = 0; i < 40; i++) saveSession({ ...sample, title: String(i) });
  expect(readSessions()).toHaveLength(30); expect(readSessions()[29].title).toBe('10');
  saveSession({ ...sample, title: '39', state: 'updated' }); expect(readSessions()).toHaveLength(30); expect(readSessions()[0].state).toBe('updated');
});

it('rejects broken canvas and malformed views before restoration', () => {
  expect(() => validateSessionState({ view: { mode: 'invalid' } })).toThrow();
  expect(() => validateSessionState({ view: { mode: 'objects', selected: null, flowId: null }, canvases: { bad: { positions: {}, viewport: { x: 0, y: 0, zoom: 0 } } } })).toThrow();
  expect(() => validateSessionState({ view: { mode: 'objects', selected: 'id', flowId: null }, favorites: ['id'] })).not.toThrow();
});

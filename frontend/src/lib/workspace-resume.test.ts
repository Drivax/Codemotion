import { beforeEach, expect, it } from 'vitest';
import { readWorkspace, writeWorkspace, RESUME_KEY } from './workspace-resume';
const session = { format: 1 as const, repository: 'a'.repeat(24), snapshot: 'b'.repeat(64), title: 'Projet', savedAt: '2026-10-20', state: { view: { mode: 'objects', selected: null, flowId: null, playback: null }, tabState: { tabs: ['one'], recent: ['one', 'two'] }, documentationOpen: true, panels: { explorer: true, inspector: false, source: true }, canvases: { root: { viewport: { x: 2, y: 4, zoom: 0.7 }, positions: {} } } } };
beforeEach(() => localStorage.clear());
it('roundtrips tabs, mode, panels and viewport', () => { writeWorkspace(session); expect(readWorkspace()).toEqual(session); });
it('rejects corrupted and unbounded resume records', () => { localStorage.setItem(RESUME_KEY, '{'); expect(readWorkspace()).toBeNull(); localStorage.setItem(RESUME_KEY, JSON.stringify({ ...session, state: { ...session.state, tabState: { tabs: Array(13).fill('a'), recent: [] } } })); expect(readWorkspace()).toBeNull(); localStorage.setItem(RESUME_KEY, JSON.stringify({ ...session, state: { ...session.state, panels: null } })); expect(readWorkspace()).toBeNull(); });

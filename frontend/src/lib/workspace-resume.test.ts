import { emptyDocumentationState } from './documentation';
import { defaultGraphOptions, validateSessionState } from './session';
import { beforeEach, expect, it, vi } from 'vitest';
import { readWorkspace, readWorkspaces, removeWorkspace, writeWorkspace, RESUME_KEY } from './workspace-resume';
const session = { format: 1 as const, repository: 'a'.repeat(24), snapshot: 'b'.repeat(64), title: 'Projet', savedAt: '2026-10-20', state: { view: { mode: 'objects', selected: null, flowId: null, playback: null }, tabState: { tabs: ['one'], recent: ['one', 'two'] }, documentationOpen: true, panels: { explorer: true, inspector: false, source: true }, canvases: { root: { viewport: { x: 2, y: 4, zoom: 0.7 }, positions: {} } } } };
beforeEach(() => localStorage.clear());
it('roundtrips tabs, mode, panels and viewport', () => { writeWorkspace(session); expect(readWorkspace()).toEqual(session); });
it('rejects corrupted and unbounded resume records', () => { localStorage.setItem(RESUME_KEY, '{'); expect(readWorkspace()).toBeNull(); localStorage.setItem(RESUME_KEY, JSON.stringify([{ ...session, state: { ...session.state, tabState: { tabs: Array(13).fill('a'), recent: [] } } }])); expect(readWorkspace()).toBeNull(); localStorage.setItem(RESUME_KEY, JSON.stringify([{ ...session, state: { ...session.state, panels: null } }])); expect(readWorkspace()).toBeNull(); });

it('roundtrips a README section, annotated draft and separate tab paths', () => {
 const documentationState = { ...emptyDocumentationState(), file: 'docs/guide.md', sectionId: 'usage', home: false, name: 'À finir', draft: [{ label: 'entry', path: 'main.py', line: 2, document: 'docs/guide.md', section: 'usage', note: 'Vérifier cette branche' }] };
 const visit = { view: { mode: 'flow', selected: 'one', flowId: 'one', playback: { trail: ['input', 'true'], index: 1 } }, stack: [], options: defaultGraphOptions, canvases: {}, sourceOverride: null, inspected: null, hierarchy: null, focus: true };
 const saved = { ...session, state: { ...session.state, documentationState, tabVisits: { one: visit } } };
 writeWorkspace(saved); expect(readWorkspace()).toEqual(saved);
 expect(() => validateSessionState({ ...saved.state, documentationState: { ...documentationState, draft: [{ ...documentationState.draft[0], note: 12 }] } })).toThrow();
 expect(() => validateSessionState({ ...saved.state, tabVisits: { other: visit } })).toThrow();
 expect(() => validateSessionState({ ...saved.state, tabVisits: { one: { ...visit, stack: null } } })).toThrow();
});
it('keeps the previous resume when saving invalid new state', () => { writeWorkspace(session); expect(() => writeWorkspace({ ...session, state: { ...session.state, documentationState: { draft: null } } })).toThrow(); expect(readWorkspace()).toEqual(session); });

it('keeps independent projects and orders them by last opening, not autosave', () => {
 const a = { ...session, lastOpenedAt: '2026-10-21T10:00:00Z' };
 const b = { ...session, repository: 'c'.repeat(24), title: 'Second', lastOpenedAt: '2026-10-22T10:00:00Z' };
 writeWorkspace(a); writeWorkspace(b); writeWorkspace({ ...a, savedAt: '2026-10-23T10:00:00Z' });
 expect(readWorkspaces().map(s => s.repository)).toEqual([b.repository, a.repository]);
 expect(readWorkspaces()[1].savedAt).toBe('2026-10-23T10:00:00Z');
 removeWorkspace(b.repository); expect(readWorkspaces()).toHaveLength(1);
});
it('migrates the old workspace only after a successful write', () => {
 localStorage.setItem('codemotion.workspace.v1', JSON.stringify(session)); expect(readWorkspace()).toEqual(session);
 const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
 expect(() => writeWorkspace(session)).toThrow(); expect(readWorkspace()).toEqual(session); set.mockRestore();
 writeWorkspace(session); expect(localStorage.getItem('codemotion.workspace.v1')).toBeNull(); expect(readWorkspace()).toEqual(session);
});
it('preserves all projects if the browser quota is reached', () => {
 writeWorkspace(session); const previous = localStorage.getItem(RESUME_KEY);
 const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
 expect(() => writeWorkspace({ ...session, repository: 'c'.repeat(24) })).toThrow();
 expect(localStorage.getItem(RESUME_KEY)).toBe(previous); set.mockRestore();
});

it('does not evict existing spaces when the count limit is reached', () => {
 for (let i = 0; i < 30; i++) writeWorkspace({ ...session, repository: i.toString(16).padStart(24, '0') });
 expect(() => writeWorkspace(session)).toThrow('30 espaces'); expect(readWorkspaces()).toHaveLength(30);
});
it('rejects oversized collections without replacing existing data', () => {
 writeWorkspace(session); const previous = localStorage.getItem(RESUME_KEY);
 expect(() => writeWorkspace({ ...session, state: { ...session.state, search: 'x'.repeat(4_000_000) } })).toThrow('4 Mo');
 expect(localStorage.getItem(RESUME_KEY)).toBe(previous);
});

it('persists named bookmarks and the last closed tab with its context', () => {
 const visit = { view: session.state.view, stack: [], options: defaultGraphOptions, canvases: {}, sourceOverride: null, inspected: null, hierarchy: null, focus: false, documentationOpen: true, documentationState: { ...emptyDocumentationState(), sectionId: 'usage', guideIndex: 1 } };
 const state = { ...session.state, tabState: { tabs: [], recent: ['one'], closed: ['one'] }, bookmarks: [{ id: 'mark', name: 'Entraînement', note: 'Entrées', visit }] };
 writeWorkspace({ ...session, state }); expect(readWorkspace()?.state).toEqual(state);
 expect(() => validateSessionState({ ...state, bookmarks: [{ ...state.bookmarks[0], note: 'x'.repeat(2001) }] })).toThrow();
 expect(() => validateSessionState({ ...state, bookmarks: [{ ...state.bookmarks[0], visit: { ...visit, documentationState: { ...visit.documentationState, guideIndex: -1 } } }] })).toThrow();
 expect(() => writeWorkspace({ ...session, state: { ...state, tabState: { ...state.tabState, closed: ['one', 'two'] } } })).toThrow();
});

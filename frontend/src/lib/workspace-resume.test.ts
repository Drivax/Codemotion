import { emptyDocumentationState } from './documentation';
import { defaultGraphOptions, validateSessionState } from './session';
import { beforeEach, expect, it } from 'vitest';
import { readWorkspace, writeWorkspace, RESUME_KEY } from './workspace-resume';
const session = { format: 1 as const, repository: 'a'.repeat(24), snapshot: 'b'.repeat(64), title: 'Projet', savedAt: '2026-10-20', state: { view: { mode: 'objects', selected: null, flowId: null, playback: null }, tabState: { tabs: ['one'], recent: ['one', 'two'] }, documentationOpen: true, panels: { explorer: true, inspector: false, source: true }, canvases: { root: { viewport: { x: 2, y: 4, zoom: 0.7 }, positions: {} } } } };
beforeEach(() => localStorage.clear());
it('roundtrips tabs, mode, panels and viewport', () => { writeWorkspace(session); expect(readWorkspace()).toEqual(session); });
it('rejects corrupted and unbounded resume records', () => { localStorage.setItem(RESUME_KEY, '{'); expect(readWorkspace()).toBeNull(); localStorage.setItem(RESUME_KEY, JSON.stringify({ ...session, state: { ...session.state, tabState: { tabs: Array(13).fill('a'), recent: [] } } })); expect(readWorkspace()).toBeNull(); localStorage.setItem(RESUME_KEY, JSON.stringify({ ...session, state: { ...session.state, panels: null } })); expect(readWorkspace()).toBeNull(); });

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

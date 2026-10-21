import { validateSessionState, type StoredSession } from './session';
export const RESUME_KEY = 'codemotion.workspace.v1';
export function readWorkspace(): StoredSession | null {
 try { const raw = localStorage.getItem(RESUME_KEY); if (!raw || raw.length > 4_000_000) return null; const s = JSON.parse(raw); if (typeof s.title !== 'string' || typeof s.savedAt !== 'string' || s.format !== 1 || !/^[a-f0-9]{24}$/.test(s.repository) || !/^[a-f0-9]{64}$/.test(s.snapshot)) return null; validateSessionState(s.state); const tabs = s.state.tabState; if (tabs && (!Array.isArray(tabs.tabs) || tabs.tabs.length > 12 || !Array.isArray(tabs.recent) || tabs.recent.length > 30 || [...tabs.tabs, ...tabs.recent].some(id => typeof id !== 'string'))) return null; return s; } catch { return null; }
}
export function writeWorkspace(session: StoredSession) { validateSessionState(session.state); const raw = JSON.stringify(session); if (raw.length > 4_000_000) throw new Error('Espace de travail trop volumineux pour la reprise automatique.'); localStorage.setItem(RESUME_KEY, raw); }

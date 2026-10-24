import { validateSessionState, type StoredSession } from './session';
export const RESUME_KEY = 'codemotion.workspaces.v2';
const LEGACY_KEY = 'codemotion.workspace.v1';
export type RecentWorkspace = StoredSession & { lastOpenedAt?: string };
function valid(s: RecentWorkspace): boolean {
 try {
  if (!s || typeof s.title !== 'string' || !Number.isFinite(Date.parse(s.savedAt)) || s.format !== 1 || !/^[a-f0-9]{24}$/.test(s.repository) || !/^[a-f0-9]{64}$/.test(s.snapshot) || (s.lastOpenedAt !== undefined && !Number.isFinite(Date.parse(s.lastOpenedAt)))) return false;
  validateSessionState(s.state); const tabs = s.state.tabState as { tabs: unknown[]; recent: unknown[]; closed?: unknown[] } | undefined;
  return !tabs || ((tabs.closed === undefined || Array.isArray(tabs.closed) && tabs.closed.length <= 1 && tabs.closed.every(id => typeof id === 'string')) && Array.isArray(tabs.tabs) && tabs.tabs.length <= 12 && Array.isArray(tabs.recent) && tabs.recent.length <= 30 && [...tabs.tabs, ...tabs.recent].every(id => typeof id === 'string'));
 } catch { return false; }
}
export function readWorkspaces(): RecentWorkspace[] {
 try {
  const raw = localStorage.getItem(RESUME_KEY);
  if (raw !== null) {
   if (raw.length > 4_000_000) return [];
   const items: unknown = JSON.parse(raw);
   return Array.isArray(items) && items.length <= 30 ? items.filter(valid).sort((a, b) => Date.parse(b.lastOpenedAt || b.savedAt) - Date.parse(a.lastOpenedAt || a.savedAt)) : [];
  }
  const legacy = localStorage.getItem(LEGACY_KEY); if (!legacy || legacy.length > 4_000_000) return [];
  const s = JSON.parse(legacy); return valid(s) ? [s] : [];
 } catch { return []; }
}
export function readWorkspace(): RecentWorkspace | null { return readWorkspaces()[0] || null; }
export function writeWorkspace(session: RecentWorkspace) {
 if (!valid(session)) throw new Error('État de reprise invalide. La sauvegarde précédente est conservée.');
 const items = readWorkspaces().filter(s => s.repository !== session.repository);
 if (items.length >= 30) throw new Error('30 espaces conservés : exportez puis retirez un projet récent pour libérer une place.');
 const raw = JSON.stringify([session, ...items]);
 if (raw.length > 4_000_000) throw new Error('Stockage de reprise plein (4 Mo) : exportez puis retirez un projet récent.');
 localStorage.setItem(RESUME_KEY, raw);
 // Migration only after the complete multi-project record has been written successfully.
 try { localStorage.removeItem(LEGACY_KEY); } catch { /* The new record remains authoritative. */ }
}
export function removeWorkspace(repository: string) {
 localStorage.setItem(RESUME_KEY, JSON.stringify(readWorkspaces().filter(s => s.repository !== repository)));
}
export function workspaceSaveError(error: unknown): string {
 if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) return 'Stockage navigateur plein. Exportez votre travail puis retirez un projet récent pour libérer de la place.';
 return error instanceof Error ? error.message : 'Stockage navigateur indisponible. Exportez votre travail pour le conserver.';
}

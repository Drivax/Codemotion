import { validGuides } from './documentation';
import { api, post } from './api';
import { readSessions, validateSessionState, type StoredSession } from './session';
const MAX_BYTES = 120_000_000;
const extraKey = /^codemotion\.(?:(?:paths|breakpoints)\.v1:[a-f0-9]{64}:[a-f0-9]{24}|guides\.v1:[a-f0-9]{64})$/;
interface Backup { format: 'codemotion-backup'; version: 1; sessions: StoredSession[]; storage: Record<string, string>; snapshots: unknown[] }
export function parseBackup(text: string): Backup {
  if (new Blob([text]).size > MAX_BYTES) throw new Error('Sauvegarde trop volumineuse (120 Mo maximum).');
  const b = JSON.parse(text) as Backup;
  if (b?.format !== 'codemotion-backup' || b.version !== 1 || !Array.isArray(b.sessions) || b.sessions.length > 30 || !Array.isArray(b.snapshots) || b.snapshots.length > 30 || !b.storage || typeof b.storage !== 'object' || Array.isArray(b.storage)) throw new Error('Format de sauvegarde incompatible.');
  for (const s of b.sessions) {
    if (!s || s.format !== 1 || !/^[a-f0-9]{24}$/.test(s.repository) || !/^[a-f0-9]{64}$/.test(s.snapshot) || s.repository !== s.snapshot.slice(0, 24) || typeof s.title !== 'string' || s.title.length > 120 || typeof s.savedAt !== 'string') throw new Error('Métadonnées de session invalides.');
    validateSessionState(s.state);
  }
  for (const [key, value] of Object.entries(b.storage)) {
    if (!extraKey.test(key) || typeof value !== 'string' || value.length > 500_000) throw new Error('Parcours ou points d’arrêt invalides.');
    const parsed = JSON.parse(value);
    if (key.startsWith('codemotion.guides.') && !validGuides(parsed)) throw new Error('Guide invalide.');
  }
  if (JSON.stringify([b.sessions, b.storage]).length > 4_000_000) throw new Error('Métadonnées trop volumineuses pour le stockage local.');
  for (const snapshot of b.snapshots) if (new Blob([JSON.stringify(snapshot)]).size > 40_000_000) throw new Error('Un snapshot dépasse la limite de restauration de 40 Mo.');
  return b;
}
export async function exportBackup(current?: StoredSession) {
  const sessions = current ? [{ ...current, title: `Reprise — ${current.title}`.slice(0, 120) }] : readSessions();
  const storage: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i)!; if (extraKey.test(key) && (!current || key.split(':')[1] === current.snapshot)) storage[key] = localStorage.getItem(key)!; }
  const snapshots: unknown[] = [];
  const ids = new Set(sessions.map(s => s.repository));
  Object.keys(storage).forEach(key => ids.add(key.split(':')[1].slice(0, 24)));
  for (const id of ids) snapshots.push(await api(`/repositories/${id}/export`));
  const text = JSON.stringify({ format: 'codemotion-backup', version: 1, sessions, storage, snapshots });
  parseBackup(text);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `codemotion-sessions-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importBackup(file: File) {
  if (file.size > MAX_BYTES) throw new Error('Sauvegarde trop volumineuse (120 Mo maximum).');
  const b = parseBackup(await file.text());
  const merged = readSessions();
  for (const session of b.sessions) {
    if (merged.some(s => JSON.stringify(s) === JSON.stringify(session))) continue;
    let title = session.title, suffix = 1;
    while (merged.some(s => s.repository === session.repository && s.title === title)) title = `${session.title.slice(0, 95)} (importé ${suffix++})`;
    merged.push({ ...session, title });
  }
  if (merged.length > 30) throw new Error('La fusion dépasserait 30 sessions. Supprimez des sessions après les avoir sauvegardées.');
  for (const snapshot of b.snapshots) await post('/snapshots/restore', snapshot);
  // Preserve existing named paths / breakpoints on conflicts. Sessions are never silently replaced.
  const writes = Object.entries(b.storage).filter(([key]) => localStorage.getItem(key) === null);
  const oldSessions = localStorage.getItem('codemotion.sessions.v1');
  const written: string[] = [];
  try {
    for (const [key, value] of writes) { localStorage.setItem(key, value); written.push(key); }
    localStorage.setItem('codemotion.sessions.v1', JSON.stringify(merged));
  } catch (error) {
    written.forEach(key => localStorage.removeItem(key));
    if (oldSessions === null) localStorage.removeItem('codemotion.sessions.v1'); else localStorage.setItem('codemotion.sessions.v1', oldSessions);
    throw error;
  }
  return `${b.sessions.length} session(s) lue(s). Les éléments existants sont conservés. Les snapshots restaurés restent soumis au budget disque.`;
}

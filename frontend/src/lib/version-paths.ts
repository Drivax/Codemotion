import { readSessions } from './session';
export interface Compatibility { before_id: string; after_id: string | null; name: string; compatible: boolean; reason: string }
export function savedPathCompatibility(snapshot: string, functions: Compatibility[]) {
  const rows: { name: string; compatible: boolean; reason: string }[] = [];
  const check = (name: string, ids: string[]) => {
    const matches = ids.map(id => functions.find(f => f.before_id === id));
    const failures = matches.filter(f => !f?.compatible);
    rows.push({ name, compatible: failures.length === 0, reason: failures.length ? failures.map(f => f ? `${f.name} : ${f.reason}` : 'Fonction introuvable').join(' ; ') : 'Flux identiques ; aucune migration automatique.' });
  };
  for (const session of readSessions().filter(s => s.snapshot === snapshot)) {
    const state = session.state as { view?: { flowId?: string }; stack?: { flowId?: string }[] } | null;
    const ids = [state?.view?.flowId, ...(Array.isArray(state?.stack) ? state.stack.map(v => v?.flowId) : [])].filter((id): id is string => typeof id === 'string');
    if (ids.length) check(`Session : ${session.title}`, ids);
  }
  const prefix = `codemotion.paths.v1:${snapshot}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (!key.startsWith(prefix)) continue;
    try { const paths = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(paths)) for (const p of paths.slice(0, 20)) if (typeof p?.name === 'string') check(`Parcours : ${p.name}`, [key.slice(prefix.length)]); } catch { /* Invalid local data is ignored; no code is evaluated. */ }
  }
  return rows;
}

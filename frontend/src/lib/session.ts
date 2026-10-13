export interface CanvasState { positions: Record<string, {x:number;y:number}>; viewport: {x:number;y:number;zoom:number} }
export interface GraphOptions { edgeMode: 'control'|'data'|'both'; variable: string; orientation: 'TB'|'LR'; follow: boolean; hideSelf: boolean; light: boolean }
export const defaultGraphOptions: GraphOptions = { edgeMode:'control',variable:'',orientation:'TB',follow:true,hideSelf:true,light:false };
export interface StoredSession { format:1; repository:string; snapshot:string; title:string; savedAt:string; state:unknown }
const KEY='codemotion.sessions.v1';
export function readSessions(): StoredSession[] {
  try { const value: unknown=JSON.parse(localStorage.getItem(KEY)||'[]'); return Array.isArray(value) ? value.filter((s):s is StoredSession => !!s && s.format===1 && typeof s.repository==='string' && typeof s.snapshot==='string' && typeof s.title==='string').slice(0,30) : []; } catch { return []; }
}
export function saveSession(session:StoredSession) { const sessions=readSessions().filter(s=>!(s.repository===session.repository && s.title===session.title)); localStorage.setItem(KEY,JSON.stringify([session,...sessions].slice(0,30))); }
export function removeSession(repository:string,title:string) { localStorage.setItem(KEY,JSON.stringify(readSessions().filter(s=>!(s.repository===repository && s.title===title)))); }
export function renameSession(repository:string,title:string,next:string) { const sessions=readSessions(); const item=sessions.find(s=>s.repository===repository && s.title===title); const name=next.trim().slice(0,120); if(item && name) localStorage.setItem(KEY,JSON.stringify([{...item,title:name},...sessions.filter(s=>s.repository!==repository || (s.title!==title && s.title!==name))].slice(0,30))); }

export function validateSessionState(value: unknown): asserts value is Record<string, unknown> {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const fail = () => { throw new Error('Session invalide ou incompatible. Réimportez le snapshot.'); };
  if (!object(value) || !object(value.view)) return fail();
  const view = value.view;
  if (!['objects','flow'].includes(String(view.mode)) || (view.selected !== null && typeof view.selected !== 'string') || (view.flowId !== null && typeof view.flowId !== 'string')) fail();
  if (view.mode === 'flow' && (!view.flowId || !object(view.playback))) fail();
  for (const name of ['expanded','kinds','relations','favorites']) if (value[name] !== undefined && (!Array.isArray(value[name]) || !(value[name] as unknown[]).every(v => typeof v === 'string'))) fail();
  if (value.options !== undefined) { const o = value.options; if (!object(o) || !['control','data','both'].includes(String(o.edgeMode)) || !['TB','LR'].includes(String(o.orientation)) || typeof o.variable !== 'string' || ['follow','hideSelf','light'].some(k => typeof o[k] !== 'boolean')) fail(); }
  if (value.panels !== undefined && (!object(value.panels) || ['explorer','inspector','source'].some(k => typeof (value.panels as Record<string, unknown>)[k] !== 'boolean'))) fail();
  if (value.canvases !== undefined) {
    if (!object(value.canvases)) return fail();
    for (const c of Object.values(value.canvases)) {
      if (!object(c) || !object(c.viewport) || !object(c.positions) || !['x','y','zoom'].every(k => Number.isFinite((c.viewport as Record<string, unknown>)[k]))) return fail();
      if (Number(c.viewport.zoom) <= 0 || Number(c.viewport.zoom) > 10) fail();
      for (const p of Object.values(c.positions)) if (!object(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) fail();
    }
  }
  if (value.stack !== undefined && (!Array.isArray(value.stack) || value.stack.length > 8 || !value.stack.every(v => object(v) && typeof v.flowId === 'string' && object(v.playback)))) fail();
}

import type { SymbolNode } from './types';
export interface DocReference { label: string; text: string; evidence: string; status: string; path: string | null; line: number; anchor: string; href?: string; targets: SymbolNode[]; truncated?: boolean }
export interface DocSection { id: string; title: string; level: number; line: number; body: string; references: DocReference[] }
export interface Documentation { available?: string[]; documents: { path: string; sections: DocSection[] }[]; truncated: boolean; limitation: string }
export interface GuideStep { label: string; document: string; section: string; path: string; line: number; symbol?: string }
export interface Guide { name: string; steps: GuideStep[]; index: number }
export const guideKey = (snapshot: string) => `codemotion.guides.v1:${snapshot}`;
export function validGuides(value: unknown): value is Guide[] {
  return Array.isArray(value) && value.length <= 20 && value.every(g => g && typeof g.name === 'string' && g.name.length > 0 && g.name.length <= 100 && Array.isArray(g.steps) && g.steps.length > 0 && g.steps.length <= 30 && Number.isInteger(g.index) && g.index >= 0 && g.index < g.steps.length && g.steps.every((s: GuideStep) => s && ['label', 'document', 'section', 'path'].every(k => typeof s[k as keyof GuideStep] === 'string') && Number.isInteger(s.line) && s.line > 0 && (s.symbol === undefined || typeof s.symbol === 'string')));
}
export function readGuides(snapshot: string): Guide[] { try { const value = JSON.parse(localStorage.getItem(guideKey(snapshot)) || '[]'); return validGuides(value) ? value : []; } catch { return []; } }
export function stepFor(ref: DocReference, document: string, section: string, target?: SymbolNode): GuideStep | null {
  if (target?.source) return { label: target.qualified_name, path: target.source.file, line: ref.status === 'file' ? ref.line : target.source.start_line, symbol: target.id, document, section };
  if (ref.status === 'file' && ref.path?.endsWith('.py')) return { label: ref.label, path: ref.path, line: ref.line, document, section };
  return null;
}

import type { SymbolNode } from './types';
export interface DocReference { label: string; text: string; evidence: string; status: string; path: string | null; line: number; anchor: string; href?: string; targets: SymbolNode[]; truncated?: boolean }
export interface DocSection { id: string; title: string; level: number; line: number; body: string; references: DocReference[] }
export interface Documentation { available?: string[]; documents: { path: string; sections: DocSection[] }[]; truncated: boolean; limitation: string }
export interface GuideStep { label: string; document: string; section: string; path: string; line: number; symbol?: string; note?: string; completed?: boolean }
export interface Guide { name: string; steps: GuideStep[]; index: number }
export const guideKey = (snapshot: string) => `codemotion.guides.v1:${snapshot}`;
export function validGuides(value: unknown): value is Guide[] {
  return Array.isArray(value) && value.length <= 20 && value.every(g => g && typeof g.name === 'string' && g.name.length > 0 && g.name.length <= 100 && Array.isArray(g.steps) && g.steps.length > 0 && g.steps.length <= 30 && Number.isInteger(g.index) && g.index >= 0 && g.index < g.steps.length && g.steps.every((s: GuideStep) => s && ['label', 'document', 'section', 'path'].every(k => typeof s[k as keyof GuideStep] === 'string') && Number.isInteger(s.line) && s.line > 0 && (s.symbol === undefined || typeof s.symbol === 'string') && (s.note === undefined || typeof s.note === 'string' && s.note.length <= 2000) && (s.completed === undefined || typeof s.completed === 'boolean')));
}
export function readGuides(snapshot: string): Guide[] { try { const value = JSON.parse(localStorage.getItem(guideKey(snapshot)) || '[]'); return validGuides(value) ? value : []; } catch { return []; } }
export function stepFor(ref: DocReference, document: string, section: string, target?: SymbolNode): GuideStep | null {
  if (target?.source) return { label: target.qualified_name, path: target.source.file, line: ref.status === 'file' ? ref.line : target.source.start_line, symbol: target.id, document, section };
  if (ref.status === 'file' && ref.path?.endsWith('.py')) return { label: ref.label, path: ref.path, line: ref.line, document, section };
  return null;
}

export interface DocumentationState { file: string; sectionId: string; home: boolean; query: string; pickedSections: string[]; draft: GuideStep[]; name: string; activeGuide: string | null; guideIndex?: number }
export const emptyDocumentationState = (): DocumentationState => ({ file: '', sectionId: '', home: true, query: '', pickedSections: [], draft: [], name: 'Découverte du projet', activeGuide: null });
export function validDocumentationState(value: unknown): value is DocumentationState {
 if (!value || typeof value !== 'object') return false;
 const v = value as DocumentationState;
 return (v.guideIndex === undefined || Number.isInteger(v.guideIndex) && v.guideIndex >= 0 && v.guideIndex < 30) && ['file', 'sectionId', 'query', 'name'].every(k => typeof v[k as 'file'] === 'string') && v.name.length <= 100 && typeof v.home === 'boolean' && (v.activeGuide === null || typeof v.activeGuide === 'string') && Array.isArray(v.pickedSections) && v.pickedSections.length <= 8000 && v.pickedSections.every(s => typeof s === 'string') && Array.isArray(v.draft) && v.draft.length <= 30 && (!v.draft.length || validGuides([{ name: 'Brouillon', index: 0, steps: v.draft }]));
}

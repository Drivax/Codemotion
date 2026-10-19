import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { GuideStep } from '@/lib/documentation';
import type { Details } from '@/lib/types';
export default function GuideRelations({ repository, steps }: { repository: string; steps: GuideStep[] }) {
  const [relations, setRelations] = useState<string[]>([]);
  useEffect(() => { const controller = new AbortController(); setRelations([]); void Promise.all(steps.slice(0, -1).map(async (step, i) => { if (!step.symbol || !steps[i + 1].symbol) return `${i + 1} → ${i + 2} : cible sans symbole`; try { const d = await api<Details>(`/repositories/${repository}/symbols/${step.symbol}`, { signal: controller.signal }); const edges = d.relations.filter(r => r.source === step.symbol && r.target === steps[i + 1].symbol); return `${i + 1} → ${i + 2} : ${edges.length ? edges.map(r => r.kind + ' (' + r.resolution + ')').join(', ') : 'aucune relation directe identifiée'}`; } catch { return `${i + 1} → ${i + 2} : relation indisponible`; } })).then(result => { if (!controller.signal.aborted) setRelations(result); }); return () => controller.abort(); }, [repository, steps]);
  return steps.length > 1 ? <details><summary>Relations statiques entre les étapes</summary><p>Relations directes orientées ; elles ne prouvent pas un ordre d’exécution.</p>{relations.map((r, i) => <p key={i}>{r}</p>)}</details> : null;
}

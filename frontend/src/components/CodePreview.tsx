import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
const cache = new Map<string, { source: string; truncated: boolean }>();
export default function CodePreview({ repository, file, line = 1 }: { repository: string; file: string; line?: number }) {
 const [state, setState] = useState<{ source: string; truncated: boolean } | null>(null), [error, setError] = useState('');
 useEffect(() => { const key = `${repository}:${file}:${line}`; setError(''); setState(cache.get(key) || null); if (cache.has(key)) return; const c = new AbortController(); const timer = setTimeout(() => { void api<{ source: string; truncated: boolean }>(`/repositories/${repository}/snippet?file=${encodeURIComponent(file)}&line=${line}&count=30`, { signal: c.signal }).then(r => { if (c.signal.aborted) return; cache.set(key, r); if (cache.size > 40) cache.delete(cache.keys().next().value!); setState(r); }).catch(() => { if (!c.signal.aborted) setError('Extrait indisponible dans ce snapshot.'); }); }, 120); return () => { clearTimeout(timer); c.abort(); }; }, [repository, file, line]);
 return <section className="code-preview"><small>{file} · ligne {line}</small>{error ? <p role="status">{error}</p> : state ? <><pre><code>{state.source}</code></pre>{state.truncated && <small>Extrait limité — ouvrez la définition pour consulter la suite.</small>}</> : <p role="status">Chargement de l’extrait…</p>}</section>;
}

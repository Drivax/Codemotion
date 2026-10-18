'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
export default function ServiceStatus() {
  const [status, setStatus] = useState('Vérification…'), [retry, setRetry] = useState(0);
  useEffect(() => {
    let closed = false;
    const controller = new AbortController();
    const probe = async () => {
      try { const result = await api<{ status: string; mode: string }>('/health', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]) }); if (!closed) setStatus(result.status === 'ok' && result.mode === 'static' ? 'API disponible' : 'API incompatible'); }
      catch { if (!closed) setStatus('API indisponible'); }
    };
    void probe(); const timer = window.setInterval(() => void probe(), 15000);
    return () => { closed = true; controller.abort(); window.clearInterval(timer); };
  }, [retry]);
  return <button className="service-status" onClick={() => setRetry(n => n + 1)} title="Interface chargée dans le navigateur. Vérification de l’API toutes les 15 secondes ; cliquez pour réessayer. Si elle est indisponible, ouvrez Lancer CodeMotion.cmd."><span className="service-interface">Interface chargée · </span><span role="status">{status}</span></button>;
}

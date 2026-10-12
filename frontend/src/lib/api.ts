export const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API + '/api' + path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail));
  }
  return response.json() as Promise<T>;
}
export const post = <T,>(path: string, data?: unknown) => api<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined });

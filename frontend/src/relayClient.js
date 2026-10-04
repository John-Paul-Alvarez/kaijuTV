export const apiBase = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function defaultRelay(source) {
  try { return new URL(source).hostname === 'jmp2.uk'; } catch { return false; }
}

export async function createRelaySession(source, signal, { fetcher = fetch, base = apiBase } = {}) {
  let response;
  try {
    response = await fetcher(`${base}/api/relay/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ url: source }),
    });
  } catch (error) {
    throw Object.assign(new Error(signal?.aborted ? 'The backend relay connection was interrupted or timed out.' : 'Could not reach the backend relay. Start the backend and check its address.'),
      { code: signal?.aborted ? 'RELAY_CONNECT_TIMEOUT' : 'RELAY_UNREACHABLE', cause: error });
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(`${data?.message || 'The backend could not create a relay session.'}${data?.reasonCode ? ` (${data.reasonCode})` : ''}`),
    { code: data?.code || 'RELAY_SETUP_FAILED', status: response.status });
  if (typeof data?.id !== 'string' || typeof data?.manifestPath !== 'string' || !data.manifestPath.startsWith(`/api/relay/sessions/${data.id}/resources/`)) {
    throw Object.assign(new Error('The backend returned an invalid relay session.'), { code: 'INVALID_RELAY_RESPONSE' });
  }
  return { id: data.id, manifestUrl: base + data.manifestPath };
}

export function releaseRelaySession(id, { fetcher = fetch, base = apiBase } = {}) {
  return fetcher(`${base}/api/relay/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', keepalive: true, signal: AbortSignal.timeout(3000) }).catch(() => {});
}

export async function relayLastError(id, signal, { fetcher = fetch, base = apiBase } = {}) {
  try {
    const response = await fetcher(`${base}/api/relay/sessions/${encodeURIComponent(id)}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]),
    });
    if (!response.ok) return null;
    return (await response.json()).lastError || null;
  } catch { return null; }
}

import { safeRequest } from './safeRequest.js';

export function createDirectory({ request = safeRequest, ttlMs = 3600000 } = {}) {
  let urls = new Set();
  let loadedAt = 0;
  let pending;
  return {
    async contains(url) {
      if (Date.now() - loadedAt > ttlMs) {
        pending ||= (async () => {
          const response = await request('https://iptv-org.github.io/api/streams.json', {
            signal: AbortSignal.timeout(15000), maxBytes: 8 * 1024 * 1024,
          });
          if (response.status !== 200 || response.truncated) throw new Error('Directory unavailable');
          const entries = JSON.parse(response.body.toString('utf8'));
          if (!Array.isArray(entries)) throw new Error('Invalid directory');
          urls = new Set(entries.filter(e => !e.user_agent && !e.referrer && typeof e.url === 'string').map(e => e.url));
          loadedAt = Date.now();
        })().finally(() => { pending = null; });
        await pending;
      }
      return urls.has(url);
    },
    get loadedAt() { return loadedAt ? new Date(loadedAt).toISOString() : null; },
  };
}

import express from 'express';
import { randomUUID } from 'node:crypto';
import { createDirectory } from './directory.js';
import { diagnose } from './diagnostics.js';
import { validateUrl, safeUrl } from './safeRequest.js';
import { createRelay } from './relay.js';

export function createApp({ directory = createDirectory(), probe = diagnose,
  origins = ['http://127.0.0.1:5173', 'http://localhost:5173'], maxConcurrent = 2, relayOptions = {} } = {}) {
  const app = express();
  const history = [];
  const cache = new Map();
  const clients = new Map();
  let active = 0;
  const relay = createRelay({ directory, ...relayOptions });
  app.disable('x-powered-by');
  // Do not trust arbitrary forwarding headers; Render can use a configured TRUST_PROXY_HOPS.
  if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) return res.status(403).json({ code: 'ORIGIN_NOT_ALLOWED', message: 'This frontend origin is not configured.' });
    if (origin) res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges' });
    if (req.method === 'OPTIONS') {
      res.set({ 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Range' });
      return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json({ limit: '4kb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'kaijutv-diagnostics',
    activeChecks: active, directoryLoadedAt: directory.loadedAt, historyStorage: 'temporary-memory', relay: relay.stats }));
  relay.mount(app);
  app.get('/api/diagnostics/recent', (_req, res) => res.json({ results: history }));
  app.post('/api/diagnostics', async (req, res) => {
    const now = Date.now();
    for (const [ip, state] of clients) if (now - state.start >= 60000) clients.delete(ip);
    const client = clients.get(req.ip) || { start: now, count: 0 };
    if (!clients.has(req.ip) && clients.size >= 1000) return res.status(503).json({ code: 'BUSY', message: 'Try again shortly.' });
    clients.set(req.ip, client);
    if (++client.count > 10) { res.set('Retry-After', '60'); return res.status(429).json({ code: 'RATE_LIMIT', message: 'Wait a minute before checking more streams.' }); }
    const { url, channelName = '', sourceNumber = 1, browserError = null } = req.body || {};
    if (typeof url !== 'string' || url.length > 4096 || typeof channelName !== 'string' || channelName.length > 160 ||
      !Number.isInteger(sourceNumber) || sourceNumber < 1 || sourceNumber > 100 ||
      (browserError !== null && (typeof browserError !== 'string' || browserError.length > 100))) {
      return res.status(400).json({ code: 'INVALID_INPUT', message: 'Provide a stream URL and valid channel/source information.' });
    }
    try { validateUrl(url); } catch (error) { return res.status(400).json({ code: error.code, message: error.message }); }
    if (active >= maxConcurrent) return res.status(503).json({ code: 'BUSY', message: 'Two stream checks are running. Try again shortly.' });
    active++;
    try {
      let allowed;
      try { allowed = await directory.contains(url); }
      catch (error) { return res.status(503).json({ code: 'DIRECTORY_UNAVAILABLE',
        reasonCode: /^[A-Z0-9_]{1,60}$/.test(error.code || '') ? error.code : 'DIRECTORY_FETCH_FAILED',
        message: 'Could not validate this source against IPTV-org. Check backend network access and try again.' }); }
      if (!allowed) return res.status(400).json({ code: 'SOURCE_NOT_IN_DIRECTORY', message: 'Only current IPTV-org sources without special request headers can be checked.' });
      for (const [key, entry] of cache) if (now - entry.at >= 60000) cache.delete(key);
      const cached = cache.get(url);
      const result = cached ? cached.result : await probe(url);
      if (!cached) {
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(url, { at: Date.now(), result });
      }
      const report = { id: randomUUID(), channelName, sourceNumber, browserError,
        sourceUrl: safeUrl(url), cached: Boolean(cached), ...result };
      history.unshift(report);
      if (history.length > 100) history.pop();
      console.info(JSON.stringify({ event: 'stream-check', id: report.id, code: report.code, elapsedMs: report.elapsedMs }));
      res.json(report);
    } catch { res.status(500).json({ code: 'DIAGNOSTIC_FAILED', message: 'The diagnostic could not complete.' }); }
    finally { active--; }
  });
  app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'API route not found.' }));
  app.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({
    code: error.status === 413 ? 'BODY_TOO_LARGE' : 'INVALID_JSON', message: 'The request body could not be accepted.' }));
  return app;
}

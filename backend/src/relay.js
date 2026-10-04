import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { safeOpen, readBody, validateUrl, safeUrl, ProbeError } from './safeRequest.js';

const MB = 1024 * 1024;
const PLAYLIST_LIMIT = MB;
const MEDIA_LIMIT = 16 * MB;
const IDLE_MS = 5 * 60 * 1000;
const LIFETIME_MS = 2 * 60 * 60 * 1000;

export function rewritePlaylist(text, base, register) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines[0].trim() !== '#EXTM3U') throw new ProbeError('INVALID_PLAYLIST', 'The upstream response is not an HLS playlist.');
  if (text.includes('{$')) throw new ProbeError('UNSUPPORTED_PLAYLIST', 'This prototype does not support playlist URL variables.');
  let variant = false;
  let references = 0;
  const reference = (url, kind) => {
    if (++references > 2000) throw new ProbeError('RESOURCE_LIMIT', 'This playlist contains too many resource references.');
    return register(url, kind);
  };
  return lines.map(raw => {
    const line = raw.trim();
    // Use complete segments; do not advertise unsupported blocking low-latency reloads.
    if (/^#EXT-X-(PART:|PART-INF:|PRELOAD-HINT:|RENDITION-REPORT:|SERVER-CONTROL:|CONTENT-STEERING:)/.test(line)) return null;
    if (!line) return '';
    if (!line.startsWith('#')) {
      const kind = variant || /\.m3u8(?:[?#]|$)/i.test(line) ? 'playlist' : 'media';
      variant = false;
      return reference(validateUrl(new URL(line, base).href).href, kind);
    }
    if (line.startsWith('#EXT-X-STREAM-INF:')) variant = true;
    const kind = /^#EXT-X-(MEDIA|I-FRAME-STREAM-INF):/.test(line) ? 'playlist' :
      /^#EXT-X-(KEY|SESSION-KEY):/.test(line) ? 'key' : 'media';
    return line.replace(/\bURI="([^"]*)"/g, (_match, value) =>
      `URI="${reference(validateUrl(new URL(value, base).href).href, kind)}"`);
  }).filter(line => line !== null).join('\n') + '\n';
}

export function validRange(value) {
  if (!value) return undefined;
  const match = /^bytes=(\d+)-(\d*)$/.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1])) ||
    (match[2] && (!Number.isSafeInteger(Number(match[2])) || Number(match[2]) < Number(match[1])))) {
    throw new ProbeError('INVALID_RANGE', 'Only a single forward byte range is supported.');
  }
  return value;
}

export function createRelay({ directory, open = safeOpen, now = Date.now,
  maxSessions = 2, maxActive = 8, maxTotalBytes = 256 * MB, maxSessionBytes = 128 * MB } = {}) {
  const sessions = new Map();
  const starts = new Map();
  let active = 0, bytesServed = 0;
  function prune() {
    const time = now();
    for (const [id, session] of sessions) if (time - session.touchedAt > IDLE_MS || time - session.createdAt > LIFETIME_MS) {
      sessions.delete(id);
      session.controller.abort();
    }
    for (const [ip, item] of starts) if (time - item.at >= 60000) starts.delete(ip);
  }
  function lookup(id) {
    prune();
    const session = sessions.get(id);
    if (session) session.touchedAt = now();
    return session;
  }
  function register(session, url, kind) {
    const key = `${kind}:${url}`;
    let id = session.byUrl.get(key);
    if (!id) {
      if (session.resources.size >= 2048) {
        const oldest = [...session.resources].find(([, resource]) => resource.kind !== 'playlist');
        if (!oldest) throw new ProbeError('RESOURCE_LIMIT', 'The playlist contains too many resources.');
        session.resources.delete(oldest[0]);
        session.byUrl.delete(oldest[1].key);
      }
      id = randomUUID();
      session.resources.set(id, { url, kind, key });
      session.byUrl.set(key, id);
    }
    return `/api/relay/sessions/${session.id}/resources/${id}`;
  }
  function consume(session, bytes) {
    if (bytesServed + bytes > maxTotalBytes || session.bytes + bytes > maxSessionBytes) {
      throw new ProbeError('RELAY_BUDGET_EXCEEDED', 'The prototype relay bandwidth budget has been reached.');
    }
    bytesServed += bytes; session.bytes += bytes;
  }
  function fail(session, res, error, stage, target) {
    const code = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : error.code || 'RELAY_UPSTREAM_ERROR';
    const details = { code, message: error instanceof ProbeError ? error.message : 'The relay could not retrieve this upstream resource.',
      stage, upstreamStatus: error.upstreamStatus || null, url: safeUrl(target), detectedAt: new Date(now()).toISOString() };
    session.lastError = details;
    if (res.headersSent) res.destroy();
    else {
      res.removeHeader('Content-Range');
      res.status(code === 'INVALID_RANGE' ? 416 : code === 'RELAY_BUDGET_EXCEEDED' ? 429 : 502).type('application/json').json(details);
    }
  }
  return {
    get stats() { prune(); return { sessions: sessions.size, activeRequests: active, bytesServed, maxTotalBytes }; },
    mount(app) {
      app.post('/api/relay/sessions', async (req, res) => {
        prune();
        const time = now();
        const client = starts.get(req.ip) || { at: time, count: 0 };
        if (++client.count > 10 || (!starts.has(req.ip) && starts.size >= 1000)) return res.status(429).json({ code: 'RELAY_RATE_LIMIT', message: 'Wait a minute before starting more relay sessions.' });
        starts.set(req.ip, client);
        const url = req.body?.url;
        if (typeof url !== 'string' || url.length > 4096) return res.status(400).json({ code: 'INVALID_URL', message: 'Provide a valid source URL.' });
        try { validateUrl(url); } catch (error) { return res.status(400).json({ code: error.code, message: error.message }); }
        if (bytesServed >= maxTotalBytes) return res.status(429).json({ code: 'RELAY_BUDGET_EXCEEDED', message: 'The prototype relay bandwidth budget has been reached.' });
        if (sessions.size >= maxSessions) return res.status(503).json({ code: 'RELAY_BUSY', message: 'Two relay sessions are active. Close another channel or wait for its session to expire.' });
        // Reserve a slot before the asynchronous directory load.
        const session = { id: randomUUID(), createdAt: time, touchedAt: time, bytes: 0,
          resources: new Map(), byUrl: new Map(), controller: new AbortController(), lastError: null };
        sessions.set(session.id, session);
        try {
          if (!await directory.contains(url)) {
            sessions.delete(session.id);
            return res.status(400).json({ code: 'SOURCE_NOT_IN_DIRECTORY', message: 'Only current IPTV-org sources without special request headers can be relayed.' });
          }
          if (!sessions.has(session.id) || res.destroyed) { sessions.delete(session.id); return; }
          const manifestPath = register(session, validateUrl(url).href, 'playlist');
          res.status(201).json({ id: session.id, manifestPath, expiresAfterIdleSeconds: IDLE_MS / 1000 });
        } catch (error) {
          sessions.delete(session.id);
          res.status(503).json({ code: 'DIRECTORY_UNAVAILABLE', message: 'Could not validate this source against IPTV-org.',
            reasonCode: /^[A-Z0-9_]{1,60}$/.test(error.code || '') ? error.code : 'DIRECTORY_FETCH_FAILED' });
        }
      });
      app.get('/api/relay/sessions/:id', (req, res) => {
        const session = lookup(req.params.id);
        if (!session) return res.status(410).json({ code: 'RELAY_SESSION_EXPIRED', message: 'Relay session expired. Retry playback.' });
        res.json({ bytesServed: session.bytes, lastError: session.lastError });
      });
      app.delete('/api/relay/sessions/:id', (req, res) => {
        const session = sessions.get(req.params.id);
        session?.controller.abort();
        sessions.delete(req.params.id);
        res.sendStatus(204);
      });
      app.get('/api/relay/sessions/:id/resources/:resource', async (req, res) => {
        const session = lookup(req.params.id);
        if (!session) return res.status(410).json({ code: 'RELAY_SESSION_EXPIRED', message: 'Relay session expired. Retry playback.' });
        const resource = session.resources.get(req.params.resource);
        if (!resource) return res.status(404).json({ code: 'RELAY_RESOURCE_UNKNOWN', message: 'This URL was not listed by the stream playlist. Retry playback.' });
        if (Object.keys(req.query).length) return res.status(400).json({ code: 'UNSUPPORTED_RELAY_QUERY', message: 'Relay URLs cannot override an upstream resource.' });
        if (active >= maxActive) return res.status(503).json({ code: 'RELAY_BUSY', message: 'The relay has reached its concurrent request limit.' });
        active++;
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, session.controller.signal, AbortSignal.timeout(30000)]);
        const disconnect = () => { if (!res.writableFinished) controller.abort(); };
        res.on('close', disconnect);
        let upstream;
        try {
          if (bytesServed >= maxTotalBytes || session.bytes >= maxSessionBytes) throw new ProbeError('RELAY_BUDGET_EXCEEDED', 'The prototype relay bandwidth budget has been reached.');
          const range = resource.kind === 'playlist' ? undefined : validRange(req.headers.range);
          upstream = await open(resource.url, { signal, range });
          if (upstream.status < 200 || upstream.status >= 300) {
            const error = new ProbeError('UPSTREAM_HTTP_ERROR', `Upstream returned HTTP ${upstream.status}.`);
            error.upstreamStatus = upstream.status; throw error;
          }
          if (resource.kind === 'playlist') {
            const { body, truncated } = await readBody(upstream.stream, PLAYLIST_LIMIT);
            if (truncated) throw new ProbeError('PLAYLIST_TOO_LARGE', 'The upstream playlist exceeded 1 MiB.');
            // HLS resolves these paths against the playlist URL: Vite locally,
            // or the HTTPS backend when the frontend is hosted separately.
            const rewritten = rewritePlaylist(body.toString('utf8'), upstream.url, (url, kind) => register(session, url, kind));
            consume(session, Buffer.byteLength(rewritten));
            res.type('application/vnd.apple.mpegurl').send(rewritten);
          } else {
            if (range && upstream.status !== 206) throw new ProbeError('UPSTREAM_RANGE_UNSUPPORTED', 'The upstream did not honor the requested byte range.');
            const type = upstream.headers['content-type'] || 'application/octet-stream';
            if (/text\/html|application\/json/i.test(type)) throw new ProbeError('UNEXPECTED_MEDIA_RESPONSE', 'The media URL returned an HTML or JSON response.');
            const length = Number(upstream.headers['content-length']);
            if (Number.isFinite(length) && length > MEDIA_LIMIT) throw new ProbeError('RESOURCE_TOO_LARGE', 'This media response exceeded the 16 MiB prototype limit.');
            let bytes = 0;
            const limiter = new Transform({ transform(chunk, _encoding, callback) {
              try {
                bytes += chunk.length;
                if (bytes > MEDIA_LIMIT) throw new ProbeError('RESOURCE_TOO_LARGE', 'This media response exceeded the 16 MiB prototype limit.');
                consume(session, chunk.length);
                callback(null, chunk);
              } catch (error) { callback(error); }
            } });
            res.status(upstream.status).set('Content-Type', type);
            for (const header of ['content-range', 'accept-ranges']) if (upstream.headers[header]) res.set(header, upstream.headers[header]);
            await pipeline(upstream.stream, limiter, res, { signal });
          }
        } catch (error) {
          if (!session.controller.signal.aborted && (error instanceof ProbeError || !controller.signal.aborted)) fail(session, res, error, resource.kind, resource.url);
        } finally {
          upstream?.stream.destroy();
          res.off('close', disconnect);
          active--;
        }
      });
    },
  };
}

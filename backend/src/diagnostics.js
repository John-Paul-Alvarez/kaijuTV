import { safeRequest, safeUrl, ProbeError } from './safeRequest.js';

export function parsePlaylist(text, base) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(line => line.trim());
  if (lines[0] !== '#EXTM3U') throw new ProbeError('INVALID_PLAYLIST', 'The response is not an HLS playlist (#EXTM3U missing).');
  const master = lines.some(line => line.startsWith('#EXT-X-STREAM-INF:'));
  let next;
  if (master) {
    const tag = lines.findIndex(line => line.startsWith('#EXT-X-STREAM-INF:'));
    next = lines.slice(tag + 1).find(line => line && !line.startsWith('#'));
  } else {
    const tag = lines.findIndex(line => line.startsWith('#EXTINF:'));
    if (tag !== -1) next = lines.slice(tag + 1).find(line => line && !line.startsWith('#'));
  }
  const map = lines.find(line => line.startsWith('#EXT-X-MAP:'))?.match(/URI="([^"]+)"/);
  const encrypted = lines.some(line => line.startsWith('#EXT-X-KEY:') && !/METHOD=NONE(?:,|$)/.test(line));
  return { kind: master ? 'master' : 'media', next: next ? new URL(next, base).href : null,
    initialization: map ? new URL(map[1], base).href : null, encrypted };
}

function errorCode(error, signal) {
  if (signal.aborted || ['AbortError', 'TimeoutError'].includes(error.name)) return 'UPSTREAM_TIMEOUT';
  return error.code || 'UPSTREAM_ERROR';
}

export async function diagnose(url, { request = safeRequest, timeoutMs = 20000 } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  const started = Date.now();
  const checks = [];
  let outcome = 'failed';
  let code = 'UPSTREAM_ERROR';
  let encrypted = false;
  const inspect = async (target, stage, sample = false) => {
    const check = { stage, url: safeUrl(target), status: null, contentType: null, bytes: 0, redirects: [] };
    checks.push(check);
    try {
      const res = await request(target, { signal, sample, maxBytes: sample ? 65536 : 262144 });
      Object.assign(check, { status: res.status, url: safeUrl(res.url), contentType: res.headers['content-type'] || null,
        bytes: res.body.length, truncated: res.truncated, redirects: res.redirects,
        corsAllowOrigin: res.headers['access-control-allow-origin'] || null });
      if (res.status < 200 || res.status >= 300) throw new ProbeError('UPSTREAM_HTTP_ERROR', `Upstream returned HTTP ${res.status}.`);
      if (!res.body.length) throw new ProbeError('EMPTY_RESPONSE', 'The upstream response was empty.');
      if (!sample && res.truncated) throw new ProbeError('PLAYLIST_TOO_LARGE', 'The playlist exceeded the 256 KiB check limit.');
      if (sample && /^\s*(?:<!doctype\s+html|<html\b)/i.test(res.body.toString('utf8', 0, 200))) {
        throw new ProbeError('UNEXPECTED_SEGMENT_RESPONSE', 'The media URL returned an HTML page.');
      }
      return res;
    } catch (error) {
      check.errorCode = errorCode(error, signal);
      // Do not expose network exception text: it can contain query tokens.
      check.message = error instanceof ProbeError ? error.message : 'The upstream request could not complete.';
      throw error;
    }
  };
  try {
    let next = url;
    let playlist;
    for (let depth = 0; depth < 3; depth++) {
      const res = await inspect(next, depth === 0 ? 'entry-playlist' : 'variant-playlist');
      try { playlist = parsePlaylist(res.body.toString('utf8'), res.url); }
      catch (error) { Object.assign(checks.at(-1), { errorCode: 'INVALID_PLAYLIST', message: 'The response was not a usable HLS playlist.' }); throw error; }
      Object.assign(checks.at(-1), { playlistKind: playlist.kind, encrypted: playlist.encrypted });
      encrypted ||= playlist.encrypted;
      if (!playlist.next) throw new ProbeError('NO_MEDIA_REFERENCE', 'No variant or media segment was listed in the sampled playlist.');
      if (playlist.kind === 'media') break;
      if (depth === 2) throw new ProbeError('PLAYLIST_DEPTH_LIMIT', 'The playlist nesting limit was exceeded.');
      next = playlist.next;
    }
    if (playlist.initialization) await inspect(playlist.initialization, 'initialization-sample', true);
    await inspect(playlist.next, 'segment-sample', true);
    outcome = 'reachable';
    code = 'SAMPLE_REACHABLE';
  } catch (error) { code = errorCode(error, signal); }
  const summaries = {
    SAMPLE_REACHABLE: 'The backend retrieved HLS playlists and a media sample. Browser playback and codecs remain unverified.',
    UPSTREAM_HTTP_ERROR: 'An upstream request returned an unsuccessful HTTP status. Inspect the failing stage below.',
    UPSTREAM_TIMEOUT: 'An upstream check exceeded the total 20-second diagnostic budget.',
    INVALID_PLAYLIST: 'The upstream response was not a usable HLS playlist.',
    BLOCKED_ADDRESS: 'A request resolved to a private or reserved network address and was blocked.',
    UNEXPECTED_SEGMENT_RESPONSE: 'The media sample URL returned HTML instead of an expected media response.',
  };
  return { outcome, code, summary: summaries[code] || 'The stream check could not finish; inspect the checks below.',
    checkedAt: new Date().toISOString(), elapsedMs: Date.now() - started, encrypted, checks,
    limitations: ['Only the first variant and one bounded media sample were checked.',
      'No decoding or sustained playback was tested. CORS headers alone do not establish browser access.',
      ...(encrypted ? ['An encryption key tag was found. Keys were not fetched; DRM or permission requirements were not established.'] : [])] };
}

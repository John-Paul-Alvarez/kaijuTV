import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class ProbeError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) || (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0) || (a === 100 && b >= 64 && b <= 127));
  }
  // Only globally routable IPv6 unicast; reject mapped IPv4 and reserved/documentation ranges.
  if (isIP(address) !== 6) return false;
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const [first, second] = normalized.split(':').map(v => parseInt(v || '0', 16));
  return first >= 0x2000 && first <= 0x3ffd && first !== 0x2002 &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
}

export function validateUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new ProbeError('INVALID_URL', 'Use a valid HTTP or HTTPS URL.'); }
  if (url.href.length > 4096 || !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80'))) {
    throw new ProbeError('BLOCKED_URL', 'Only HTTP/HTTPS on standard ports without credentials is supported.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname) && !publicAddress(hostname)) throw new ProbeError('BLOCKED_ADDRESS', 'Private or reserved addresses cannot be checked.');
  url.hash = '';
  return url;
}

export function safeUrl(input) {
  try {
    const u = new URL(input);
    return `${u.protocol}//${u.host}${u.pathname}${u.search ? '?[query hidden]' : ''}`;
  } catch { return '(invalid URL)'; }
}

export async function publicLookup(hostname, resolver = lookup) {
  const records = await resolver(hostname, { all: true, verbatim: true });
  if (!records.length || records.some(r => !publicAddress(r.address))) {
    throw new ProbeError('BLOCKED_ADDRESS', 'DNS resolved to a private or reserved address.');
  }
  return records.find(record => record.family === 4) || records[0];
}

export async function safeOpen(input, { signal = AbortSignal.timeout(20000), range, maxRedirects = 4,
  resolveAddress = publicLookup, transports = { http, https } } = {}) {
  let url = validateUrl(input);
  const redirects = [];
  for (let hop = 0; ; hop++) {
    signal?.throwIfAborted();
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // Validate DNS before every redirect and pin this connection to that result.
    const resolved = await new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal?.addEventListener('abort', abort, { once: true });
      resolveAddress(host).then(resolve, reject).finally(() => signal?.removeEventListener('abort', abort));
    });
    signal?.throwIfAborted();
    if (!publicAddress(resolved.address)) throw new ProbeError('BLOCKED_ADDRESS', 'Private or reserved addresses cannot be requested.');
    const response = await new Promise((resolve, reject) => {
      const request = (url.protocol === 'https:' ? transports.https : transports.http).request(url, {
        signal,
        agent: false,
        lookup: (_hostname, options, callback) => options?.all
          ? callback(null, [resolved]) : callback(null, resolved.address, resolved.family),
        headers: {
          'User-Agent': 'KaijuTV-Diagnostics/0.2',
          'Accept-Encoding': 'identity',
          ...(range ? { Range: range } : {}),
        },
      }, res => {
        const status = res.statusCode;
        const headers = res.headers;
        // A redirect or disconnect can emit an error before a body consumer attaches.
        res.on('error', () => {});
        if ([301, 302, 303, 307, 308].includes(status) && headers.location) {
          res.destroy();
          resolve({ status, headers, redirect: headers.location });
          return;
        }
        resolve({ status, headers, stream: res });
      });
      request.on('error', reject);
      request.end();
    });
    if (response.redirect) {
      if (hop >= maxRedirects) throw new ProbeError('REDIRECT_LIMIT', 'The redirect limit was exceeded.');
      const next = validateUrl(new URL(response.redirect, url).href);
      redirects.push({ status: response.status, from: safeUrl(url), to: safeUrl(next) });
      url = next;
      continue;
    }
    return { ...response, url: url.href, redirects };
  }
}

export async function readBody(stream, maxBytes) {
  return new Promise((resolve, reject) => {
    let bytes = 0, settled = false;
    const chunks = [];
    const finish = truncated => {
      if (settled) return;
      settled = true;
      resolve({ body: Buffer.concat(chunks), truncated });
    };
    const fail = error => { if (!settled) { settled = true; reject(error); } };
    stream.on('error', fail);
    stream.on('aborted', () => fail(new ProbeError('UPSTREAM_CLOSED', 'The upstream response was interrupted.')));
    stream.on('close', () => { if (!settled) fail(new ProbeError('UPSTREAM_CLOSED', 'The upstream response was interrupted.')); });
    stream.on('data', chunk => {
      const remaining = maxBytes - bytes;
      chunks.push(chunk.subarray(0, remaining));
      bytes += Math.min(remaining, chunk.length);
      if (bytes >= maxBytes) { finish(true); stream.destroy(); }
    });
    stream.on('end', () => finish(false));
  });
}

export async function safeRequest(input, { maxBytes = 262144, sample = false, ...options } = {}) {
  const response = await safeOpen(input, { ...options, range: sample ? `bytes=0-${maxBytes - 1}` : undefined });
  const { stream, ...meta } = response;
  return { ...meta, ...await readBody(stream, maxBytes) };
}

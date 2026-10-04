import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApp } from '../src/app.js';
import { rewritePlaylist, validRange } from '../src/relay.js';

const SOURCE = 'https://example.test/root.m3u8?token=secret';
function opened(url, body, headers = {}, status = 200) {
  return { url, stream: Readable.from([Buffer.from(body)]), headers, status, redirects: [] };
}
async function fixture(t, relayOptions = {}, directory = { contains: async url => url === SOURCE }) {
  const calls = [];
  const open = async (url, options) => {
    calls.push({ url, options });
    if (url === SOURCE) return opened('https://cdn.example.test/path/master.m3u8?new-token=secret', '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Audio",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=200000,AUDIO="audio"\nvideo/main.m3u8');
    if (url.endsWith('.m3u8')) return opened(url, '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-BYTERANGE:8@2\n#EXTINF:5,\nsegment.mp4');
    return opened(url, url.endsWith('key.bin') ? Buffer.alloc(16, 5) : '23456789', { 'content-type': 'video/mp4', ...(options.range ? { 'content-range': 'bytes 2-9/100', 'accept-ranges': 'bytes' } : {}) }, options.range ? 206 : 200);
  };
  const server = createApp({ directory, relayOptions: { open, ...relayOptions } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const start = (url = SOURCE) => fetch(`${base}/api/relay/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  const create = async () => {
    const response = await start(); assert.equal(response.status, 201); return response.json();
  };
  return { base, calls, start, create };
}

test('rewrites relative/absolute playlists, audio, keys, init and segment URI references', () => {
  const seen = [];
  const result = rewritePlaylist('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=20,URI="iframes.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=20\n//cdn.example.test/child.m3u8\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin?token=secret"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4,\n../seg.ts', 'https://example.test/path/root.m3u8', (url, kind) => { seen.push({ url, kind }); return `/api/resource/${seen.length}`; });
  assert.deepEqual(seen.map(v => v.kind), ['playlist', 'playlist', 'playlist', 'key', 'media', 'media']);
  assert.equal(seen.at(-1).url, 'https://example.test/seg.ts');
  assert.ok(!result.includes('cdn.example.test'));
  assert.ok(!result.includes('token=secret'));
  assert.match(result, /URI="\/api\/resource\/4"/);
});

test('rejects unsupported and unsafe playlists/ranges', () => {
  const register = () => '/resource';
  assert.throws(() => rewritePlaylist('<html>Denied</html>', SOURCE, register), { code: 'INVALID_PLAYLIST' });
  assert.throws(() => rewritePlaylist('#EXTM3U\nhttp://127.0.0.1/a', SOURCE, register), { code: 'BLOCKED_ADDRESS' });
  assert.throws(() => rewritePlaylist('#EXTM3U\n{$token}/a.ts', SOURCE, register), { code: 'UNSUPPORTED_PLAYLIST' });
  for (const range of ['bytes=-20', 'bytes=1-0', 'bytes=0-5,10-20', 'bytes=9007199254740992-']) assert.throws(() => validRange(range));
  assert.equal(validRange('bytes=2-9'), 'bytes=2-9');
});

test('strips low-latency reload hints while preserving complete segments', () => {
  const result = rewritePlaylist('#EXTM3U\n#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES\n#EXT-X-PART:URI="partial.ts"\n#EXT-X-PRELOAD-HINT:TYPE=PART,URI="hint.ts"\n#EXTINF:5,\nfull.ts', SOURCE, () => '/full');
  assert.ok(!result.includes('PART'));
  assert.ok(!result.includes('SERVER-CONTROL'));
  assert.match(result, /#EXTINF:5,\n\/full/);
});

test('serves rewritten master/media, streams bytes/ranges, and releases a session', async t => {
  const { base, calls, create } = await fixture(t);
  const session = await create();
  const root = await fetch(base + session.manifestPath, { headers: { Origin: 'http://127.0.0.1:5173' } });
  assert.equal(root.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
  assert.match(root.headers.get('content-type'), /mpegurl/);
  const master = await root.text();
  assert.ok(!master.includes('secret'));
  const videoPath = master.trim().split('\n').at(-1);
  const media = await (await fetch(base + videoPath)).text();
  assert.match(media, /#EXT-X-BYTERANGE:8@2/);
  const segmentPath = media.trim().split('\n').at(-1);
  const segment = await fetch(base + segmentPath, { headers: { Range: 'bytes=2-9' } });
  assert.equal(segment.status, 206);
  assert.equal(segment.headers.get('content-range'), 'bytes 2-9/100');
  assert.equal(await segment.text(), '23456789');
  assert.equal(calls.at(-1).options.range, 'bytes=2-9');
  assert.equal(calls[1].url, 'https://cdn.example.test/path/video/main.m3u8');
  const keyPath = media.match(/#EXT-X-KEY:[^\n]*URI="([^"]+)"/)[1];
  assert.equal((await (await fetch(base + keyPath)).arrayBuffer()).byteLength, 16);
  const info = await (await fetch(`${base}/api/relay/sessions/${session.id}`)).json();
  assert.ok(info.bytesServed > 8);
  assert.equal(info.lastError, null);
  assert.equal((await fetch(`${base}/api/relay/sessions/${session.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await fetch(base + session.manifestPath)).status, 410);
});

test('does not expose an arbitrary URL proxy and validates catalog membership', async t => {
  const { base, start, create, calls } = await fixture(t);
  assert.equal((await start('http://127.0.0.1/a')).status, 400);
  assert.equal((await start('https://not-in-directory.test/a')).status, 400);
  const session = await create();
  assert.equal((await fetch(base + session.manifestPath + '?url=http://127.0.0.1/')).status, 400);
  assert.equal((await fetch(`${base}/api/relay/sessions/${session.id}/resources/invented`)).status, 404);
  assert.equal(calls.length, 0);
});

test('exposes actual upstream HTTP failure in session status', async t => {
  const { base, create } = await fixture(t, { open: async url => opened(url, 'Denied', {}, 403) });
  const session = await create();
  const res = await fetch(base + session.manifestPath);
  assert.equal(res.status, 502);
  assert.equal((await res.json()).upstreamStatus, 403);
  const status = await (await fetch(`${base}/api/relay/sessions/${session.id}`)).json();
  assert.equal(status.lastError.code, 'UPSTREAM_HTTP_ERROR');
  assert.ok(!JSON.stringify(status).includes('token=secret'));
});

test('invalid upstream playlist and oversized media fail clearly', async t => {
  let openedCount = 0;
  const { base, create } = await fixture(t, { open: async url => {
    openedCount++;
    return openedCount === 1 ? opened(url, '#EXTM3U\n#EXTINF:5,\na.ts') : opened(url, 'data', { 'content-length': String(17 * 1024 * 1024) });
  } });
  const session = await create();
  const playlist = await (await fetch(base + session.manifestPath)).text();
  const segment = await fetch(base + playlist.trim().split('\n').at(-1));
  assert.equal((await segment.json()).code, 'RESOURCE_TOO_LARGE');
});

test('limits session count, request concurrency, expiry and total bandwidth', async t => {
  let time = Date.now();
  const { base, create, start } = await fixture(t, { now: () => time, maxSessions: 1, maxTotalBytes: 20 });
  const session = await create();
  assert.equal((await start()).status, 503);
  const response = await fetch(base + session.manifestPath);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'RELAY_BUDGET_EXCEEDED');
  time += 5 * 60 * 1000 + 1;
  assert.equal((await fetch(base + session.manifestPath)).status, 410);
  assert.equal((await start()).status, 201);
});

test('disconnecting a client aborts the upstream and frees the request slot', async t => {
  let capturedSignal;
  let began;
  const started = new Promise(resolve => { began = resolve; });
  const { base, create } = await fixture(t, { maxActive: 1, open: async (_url, { signal }) => {
    capturedSignal = signal; began();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const session = await create();
  const controller = new AbortController();
  const pending = fetch(base + session.manifestPath, { signal: controller.signal }).catch(error => error);
  await started;
  assert.equal((await fetch(base + session.manifestPath)).status, 503);
  controller.abort(); await pending;
  for (let i = 0; i < 20 && !capturedSignal.aborted; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(capturedSignal.aborted, true);
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.relay.activeRequests, 0);
});

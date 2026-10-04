import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress, publicLookup, validateUrl, safeUrl, ProbeError } from '../src/safeRequest.js';
import { diagnose, parsePlaylist } from '../src/diagnostics.js';
import { createDirectory } from '../src/directory.js';

const response = (url, body, status = 200, headers = {}) => ({ url, body: Buffer.from(body), status, headers, redirects: [], truncated: false });

test('rejects private, reserved, mapped, and padded IPv6 addresses', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.5', '169.254.169.254', '192.168.1.1', '100.64.1.1', '198.18.1.2', '::1', 'fc00::1', '::ffff:127.0.0.1', '2001:0db8::1', '2001:0010::1', '3fff::1']) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(publicAddress('2606:4700:4700::1111'), true);
  assert.equal(publicAddress('2001:4860:4860::8888'), true);
});

test('URL policy rejects credentials, protocols, nonstandard ports, and private IP literals', () => {
  for (const url of ['file:///etc/passwd', 'https://user:pass@example.com/a', 'http://example.com:4000/a', 'http://127.1/a', 'http://[::1]/', 'http://2130706433/']) assert.throws(() => validateUrl(url));
  assert.equal(validateUrl('http://example.com/a.m3u8').protocol, 'http:');
  assert.equal(safeUrl('https://example.com/a?secret=hidden#token'), 'https://example.com/a?[query hidden]');
});

test('DNS checks reject mixed public/private records before connecting', async () => {
  await assert.rejects(publicLookup('example.com', async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]), { code: 'BLOCKED_ADDRESS' });
  assert.deepEqual(await publicLookup('example.com', async () => [{ address: '8.8.8.8', family: 4 }]), { address: '8.8.8.8', family: 4 });
});

test('follows relative variants and samples init/media without downloading the entire stream', async () => {
  const calls = [];
  const result = await diagnose('https://example.com/master.m3u8?token=secret', { request: async (url, options) => {
    calls.push({ url, options });
    if (url.includes('master')) return response(url, '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=123\nmedia/main.m3u8');
    if (url.endsWith('.m3u8')) return response(url, '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:5,\nsegment.m4s');
    return response(url, 'some bytes', 206, { 'content-type': 'video/mp4' });
  } });
  assert.equal(result.code, 'SAMPLE_REACHABLE');
  assert.equal(calls.length, 4);
  assert.equal(calls[1].url, 'https://example.com/media/main.m3u8');
  assert.equal(calls[3].options.maxBytes, 65536);
  assert.equal(calls[3].options.sample, true);
  assert.ok(!JSON.stringify(result).includes('token=secret'));
});

test('records failing HTTP status and stops before further resources', async () => {
  const result = await diagnose('https://example.com/live.m3u8', { request: async url => response(url, 'Denied', 403) });
  assert.equal(result.code, 'UPSTREAM_HTTP_ERROR');
  assert.equal(result.checks[0].status, 403);
  assert.equal(result.checks.length, 1);
});

test('distinguishes invalid playlist, empty body, oversized playlist and segment HTML', async () => {
  for (const [body, expected] of [['<html>blocked</html>', 'INVALID_PLAYLIST'], ['', 'EMPTY_RESPONSE']]) {
    const result = await diagnose('https://example.com/live.m3u8', { request: async url => response(url, body) });
    assert.equal(result.code, expected);
  }
  const tooLarge = await diagnose('https://example.com/live.m3u8', { request: async url => ({ ...response(url, '#EXTM3U'), truncated: true }) });
  assert.equal(tooLarge.code, 'PLAYLIST_TOO_LARGE');
  const html = await diagnose('https://example.com/live.m3u8', { request: async url => response(url, url.endsWith('.m3u8') ? '#EXTM3U\n#EXTINF:5,\na.ts' : '<html>Denied</html>') });
  assert.equal(html.code, 'UNEXPECTED_SEGMENT_RESPONSE');
});

test('network and timeout errors do not leak query secrets', async () => {
  const result = await diagnose('https://example.com/live.m3u8?token=secret', { request: async () => {
    throw Object.assign(new Error('https://example.com/?token=secret'), { code: 'ENOTFOUND' });
  } });
  assert.equal(result.code, 'ENOTFOUND');
  assert.ok(!JSON.stringify(result).includes('token=secret'));
  const timeout = await diagnose('https://example.com/a.m3u8', { timeoutMs: 10, request: async (_url, { signal }) => new Promise((resolve, reject) => {
    const keepAlive = setTimeout(resolve, 500);
    signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); });
  }) });
  assert.equal(timeout.code, 'UPSTREAM_TIMEOUT');
});

test('encryption tag is evidence rather than a DRM diagnosis and key URLs are not fetched', () => {
  const result = parsePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="secret.key"\n#EXTINF:4,\na.ts', 'https://example.com/a.m3u8');
  assert.equal(result.encrypted, true);
  assert.equal(result.next, 'https://example.com/a.ts');
  assert.throws(() => parsePlaylist('not an HLS playlist', 'https://example.com/'), ProbeError);
});

test('directory cache excludes special-header sources and shares one load', async () => {
  let requests = 0;
  const directory = createDirectory({ request: async url => { requests++; return response(url, JSON.stringify([
    { url: 'https://example.com/a.m3u8' }, { url: 'https://example.com/b.m3u8', referrer: 'https://example.com/' },
  ])); } });
  const allowed = await Promise.all([directory.contains('https://example.com/a.m3u8'), directory.contains('https://example.com/a.m3u8')]);
  assert.deepEqual(allowed, [true, true]);
  assert.equal(await directory.contains('https://example.com/b.m3u8'), false);
  assert.equal(requests, 1);
});

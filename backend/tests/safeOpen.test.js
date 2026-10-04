import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { safeOpen, safeRequest } from '../src/safeRequest.js';

function transportFixture(responses, resolveAddress = async () => ({ address: '8.8.8.8', family: 4 })) {
  const calls = [];
  const transport = { request(url, options, callback) {
    calls.push({ url: url.href, options });
    const req = new EventEmitter();
    req.end = () => queueMicrotask(() => {
      const next = responses.shift();
      if (next.error) { req.emit('error', next.error); return; }
      const res = Readable.from([Buffer.from(next.body || '')]);
      Object.assign(res, { statusCode: next.status || 200, headers: next.headers || {} });
      callback(res);
    });
    return req;
  } };
  return { calls, options: { resolveAddress, transports: { http: transport, https: transport } } };
}

test('follows a 302 without CORS headers and pins each public DNS lookup', async () => {
  const fixture = transportFixture([{ status: 302, headers: { location: '/cdn/media.m3u8?token=secret' } }, { body: '#EXTM3U\n#EXTINF:3,\na.ts' }]);
  const result = await safeRequest('https://example.test/root.m3u8', fixture.options);
  assert.equal(result.status, 200);
  assert.equal(result.url, 'https://example.test/cdn/media.m3u8?token=secret');
  assert.equal(result.redirects[0].status, 302);
  assert.equal(result.redirects[0].to, 'https://example.test/cdn/media.m3u8?[query hidden]');
  for (const call of fixture.calls) {
    await new Promise((resolve, reject) => call.options.lookup('example.test', { all: true }, (error, records) => {
      if (error) return reject(error);
      assert.deepEqual(records, [{ address: '8.8.8.8', family: 4 }]); resolve();
    }));
  }
});

test('refuses a redirect to a private IP before making the next request', async () => {
  const fixture = transportFixture([{ status: 302, headers: { location: 'http://127.0.0.1/private' } }]);
  await assert.rejects(safeOpen('https://example.test/a', fixture.options), { code: 'BLOCKED_ADDRESS' });
  assert.equal(fixture.calls.length, 1);
});

test('revalidates a redirect hostname resolving to a private address', async () => {
  const fixture = transportFixture([{ status: 302, headers: { location: 'https://redirect.test/a' } }], async host => ({ address: host === 'redirect.test' ? '10.0.0.1' : '8.8.8.8', family: 4 }));
  await assert.rejects(safeOpen('https://example.test/a', fixture.options), { code: 'BLOCKED_ADDRESS' });
  assert.equal(fixture.calls.length, 1);
});

test('limits redirect loops and bounded diagnostic reads', async () => {
  const fixture = transportFixture(Array.from({ length: 3 }, () => ({ status: 302, headers: { location: '/again' } })));
  await assert.rejects(safeOpen('https://example.test/a', { ...fixture.options, maxRedirects: 2 }), { code: 'REDIRECT_LIMIT' });
  const body = transportFixture([{ body: '0123456789' }]);
  const result = await safeRequest('https://example.test/a', { ...body.options, maxBytes: 4, sample: true });
  assert.equal(result.body.toString(), '0123');
  assert.equal(result.truncated, true);
  assert.equal(body.calls[0].options.headers.Range, 'bytes=0-3');
});

test('DNS lookup is included in the abort deadline', async () => {
  const fixture = transportFixture([], () => new Promise(() => {}));
  const controller = new AbortController();
  const pending = safeOpen('https://example.test/a', { ...fixture.options, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(fixture.calls.length, 0);
});

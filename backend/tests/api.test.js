import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

async function fixture(t, overrides = {}) {
  const app = createApp({ directory: { contains: async url => url === 'https://example.com/a.m3u8?token=secret', loadedAt: null },
    probe: async () => ({ code: 'SAMPLE_REACHABLE', outcome: 'reachable', checks: [], limitations: [], elapsedMs: 1 }), ...overrides });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body = { url: 'https://example.com/a.m3u8?token=secret', channelName: 'Test channel' }, headers = {}) => fetch(`${base}/api/diagnostics`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  return { base, post };
}

test('health, CORS, input validation, catalog rejection and invalid JSON', async t => {
  const { base, post } = await fixture(t);
  assert.equal((await (await fetch(`${base}/api/health`)).json()).status, 'ok');
  assert.equal((await post(undefined, { Origin: 'https://wrong.example' })).status, 403);
  assert.equal((await post({ url: 'http://127.0.0.1/' })).status, 400);
  assert.equal((await post({ url: 'https://example.com/not-listed' })).status, 400);
  const malformed = await fetch(`${base}/api/diagnostics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const preflight = await fetch(`${base}/api/diagnostics`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5173' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
});

test('saves sanitized report and reuses short-lived probe cache', async t => {
  let calls = 0;
  const { base, post } = await fixture(t, { probe: async () => { calls++; return { code: 'SAMPLE_REACHABLE', elapsedMs: 1, checks: [], limitations: [] }; } });
  const first = await (await post()).json();
  const second = await (await post()).json();
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
  const history = await (await fetch(`${base}/api/diagnostics/recent`)).json();
  assert.equal(history.results.length, 2);
  assert.ok(!JSON.stringify(history).includes('token=secret'));
});

test('limits a client to ten checks per minute', async t => {
  const { post } = await fixture(t);
  for (let i = 0; i < 10; i++) assert.equal((await post()).status, 200);
  const limited = await post();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
});

test('limits concurrency and recovers slots after upstream failure', async t => {
  let release;
  const { post } = await fixture(t, { maxConcurrent: 1, probe: () => new Promise((_, reject) => { release = () => reject(new Error('failure')); }) });
  const pending = post();
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await post()).status, 503);
  release();
  assert.equal((await pending).status, 500);
  const next = post();
  release = null;
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  release();
  assert.equal((await next).status, 500);
});

test('directory outage returns actionable 503', async t => {
  const { post } = await fixture(t, { directory: { contains: async () => { throw new Error('down'); } } });
  const res = await post();
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'DIRECTORY_UNAVAILABLE');
});

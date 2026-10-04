import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRelay, createRelaySession, releaseRelaySession } from '../src/relayClient.js';
import { describePlaybackError } from '../src/playbackErrors.js';

test('only known jmp2.uk sources default to relay', () => {
  assert.equal(defaultRelay('https://jmp2.uk/a.m3u8'), true);
  assert.equal(defaultRelay('https://jmp2.uk.evil.test/a.m3u8'), false);
  assert.equal(defaultRelay('https://example.test/a.m3u8'), false);
});

test('creates a relay URL using configured backend base and cleans up', async () => {
  const calls = [];
  const fetcher = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ id: 'test-id', manifestPath: '/api/relay/sessions/test-id/resources/manifest' }) }; };
  const session = await createRelaySession('https://jmp2.uk/source.m3u8', new AbortController().signal, { fetcher, base: 'https://backend.test' });
  assert.equal(session.manifestUrl, 'https://backend.test/api/relay/sessions/test-id/resources/manifest');
  assert.equal(JSON.parse(calls[0].options.body).url, 'https://jmp2.uk/source.m3u8');
  await releaseRelaySession(session.id, { fetcher, base: 'https://backend.test' });
  assert.equal(calls[1].options.method, 'DELETE');
});

test('relay setup failures preserve backend code, status and reason', async () => {
  await assert.rejects(createRelaySession('https://example.test/a', new AbortController().signal, { fetcher: async () => ({ ok: false, status: 503, json: async () => ({ code: 'DIRECTORY_UNAVAILABLE', reasonCode: 'EACCES', message: 'Directory unavailable' }) }) }), error => {
    assert.equal(error.code, 'DIRECTORY_UNAVAILABLE'); assert.equal(error.status, 503); assert.match(error.message, /EACCES/); return true;
  });
  const report = describePlaybackError({ kind: 'relay', data: { details: 'DIRECTORY_UNAVAILABLE', reason: 'Directory unavailable', response: { code: 503 } } });
  assert.equal(report.stage, 'Backend relay setup');
  assert.equal(report.httpStatus, 503);
});

test('rejects a relay manifest pointing outside the session route', async () => {
  await assert.rejects(createRelaySession('https://example.test/a', new AbortController().signal, { fetcher: async () => ({ ok: true, json: async () => ({ id: 'session', manifestPath: 'https://other.test/a' }) }) }), { code: 'INVALID_RELAY_RESPONSE' });
});

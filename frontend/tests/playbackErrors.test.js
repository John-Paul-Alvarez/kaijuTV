import test from 'node:test';
import assert from 'node:assert/strict';
import { describePlaybackError, safeUrl } from '../src/playbackErrors.js';

test('native source rejection does not claim a decoding failure', () => {
  assert.equal(describePlaybackError({ kind: 'native', mediaError: { code: 4 } }).stage, 'Media source');
});

test('blocked/zero-status requests do not claim CORS or a regional block', () => {
  const result = describePlaybackError({ data: { type: 'networkError', details: 'manifestLoadError', fatal: true, response: { code: 0 } } });
  assert.equal(result.httpStatus, null);
  assert.match(result.title, /unconfirmed/);
  assert.match(result.explanation, /cannot distinguish/);
  assert.equal(result.stage, 'Channel manifest');
});
test('403 records actual status without guessing why access was refused', () => {
  const result = describePlaybackError({ data: { type: 'networkError', details: 'fragLoadError', response: { code: 403 } } });
  assert.equal(result.httpStatus, 403);
  assert.match(result.explanation, /does not prove/);
  assert.equal(result.stage, 'Video/audio segment');
});
test('missing resources and rate limits offer different explanations', () => {
  assert.match(describePlaybackError({ data: { details: 'levelLoadError', response: { code: 404 } } }).backend, /cannot restore/);
  assert.match(describePlaybackError({ data: { details: 'levelLoadError', response: { code: 429 } } }).nextStep, /Wait/);
});
test('timeout preserves the last recoverable error for troubleshooting', () => {
  const result = describePlaybackError({ kind: 'timeout', data: { type: 'networkError', details: 'manifestLoadError', fatal: false, error: new Error('network request failed') } });
  assert.equal(result.code, 'PLAYBACK_TIMEOUT');
  assert.equal(result.lastError, 'manifestLoadError');
  assert.equal(result.fatal, false);
  assert.match(result.message, /network request failed/);
});
test('codec failures distinguish conversion from relaying', () => {
  const result = describePlaybackError({ data: { type: 'mediaError', details: 'manifestIncompatibleCodecsError', reason: 'no supported codecs' } });
  assert.match(result.title, /codec/);
  assert.match(result.backend, /relay does not change codecs/);
  assert.equal(result.message, 'no supported codecs');
});
test('native video errors preserve the browser media code and message', () => {
  const result = describePlaybackError({ kind: 'native', mediaError: { code: 3, message: 'decoder initialization failed' } });
  assert.equal(result.code, 'MEDIA_ERR_3');
  assert.equal(result.message, 'decoder initialization failed');
  assert.match(result.title, /decode/);
});
test('manual play rejection and unsupported browsers are reported separately', () => {
  const permission = describePlaybackError({ kind: 'play', exception: { name: 'NotAllowedError', message: 'play rejected' } });
  assert.match(permission.nextStep, /Press Play/);
  assert.equal(describePlaybackError({ kind: 'unsupported' }).code, 'HLS_NOT_SUPPORTED');
});
test('source URL, request URL, and messages hide credentials and query values', () => {
  const url = 'https://user:secret@example.com/playlist.m3u8?token=private#fragment';
  assert.equal(safeUrl(url), 'https://example.com/playlist.m3u8?[query hidden]');
  const result = describePlaybackError({ source: url, data: { url, error: new Error(`could not load ${url}`) } });
  assert.doesNotMatch(JSON.stringify(result), /secret|private|user:/);
});
test('unknown/native network errors do not invent an HTTP status', () => {
  const result = describePlaybackError({ kind: 'native', mediaError: { code: 2 } });
  assert.equal(result.httpStatus, null);
  assert.equal(result.httpLabel, 'Not exposed by the player');
});

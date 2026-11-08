import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackPresentation } from '../src/playbackPresentation.js';

const channel = { name: 'Fixture TV' };

test('a channel must be selected before a stale playing event can show Live', () => {
  assert.deepEqual(playbackPresentation(null, 'playing'), { label: 'Choose a channel', tone: 'idle', live: false });
});

test('connecting, ready, paused, failed, and unknown states never claim the viewer is watching', () => {
  for (const state of ['idle', 'loading', 'ready', 'paused', 'error', 'unexpected']) {
    const result = playbackPresentation(channel, state);
    assert.equal(result.live, false, state);
    assert.notEqual(result.label, 'Live', state);
  }
  assert.equal(playbackPresentation(channel, 'loading').label, 'Connecting');
  assert.equal(playbackPresentation(channel, 'ready').label, 'Ready to play');
  assert.equal(playbackPresentation(channel, 'paused').label, 'Paused');
  assert.equal(playbackPresentation(channel, 'error').label, 'Stream unavailable');
});

test('playing alone exposes Live after the actual player status event', () => {
  assert.deepEqual(playbackPresentation(channel, 'playing'), { label: 'Live', tone: 'live', live: true });
  assert.equal(playbackPresentation(channel, 'loading').live, false);
});

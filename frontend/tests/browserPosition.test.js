import test from 'node:test';
import assert from 'node:assert/strict';
import { captureBrowserPosition, restoreBrowserPosition } from '../src/browserPosition.js';

test('captures the scrolled directory rather than a channel index', () => {
  assert.deepEqual(captureBrowserPosition({ scrollTop: 437, getBoundingClientRect: () => ({ top: 118 }) }), { scrollTop: 437, top: 118 });
});

test('a channel switch restores a reset pane without scrolling the page on desktop', () => {
  const pane = { scrollTop: 0, getBoundingClientRect: () => ({ top: 118 }) };
  const calls = [];
  restoreBrowserPosition({ scrollTop: 437, top: 118 }, pane, options => calls.push(options));
  assert.equal(pane.scrollTop, 437);
  assert.deepEqual(calls, []);
});

test('new playback controls above a stacked directory preserve its viewport position', () => {
  const pane = { scrollTop: 0, getBoundingClientRect: () => ({ top: 302 }) };
  const calls = [];
  restoreBrowserPosition({ scrollTop: 0, top: 152 }, pane, options => calls.push(options));
  assert.deepEqual(calls, [{ top: 150, left: 0, behavior: 'instant' }]);
});

test('a shorter channel heading compensates in the opposite direction', () => {
  const calls = [];
  restoreBrowserPosition({ scrollTop: 99, top: 200 }, { scrollTop: 0, getBoundingClientRect: () => ({ top: 120 }) }, options => calls.push(options));
  assert.equal(calls[0].top, -80);
});

test('missing or unchanged geometry never causes an unwanted jump', () => {
  let calls = 0;
  const pane = { scrollTop: 123, getBoundingClientRect: () => ({ top: 118.5 }) };
  restoreBrowserPosition(null, pane, () => calls++);
  restoreBrowserPosition({ scrollTop: 0, top: 118 }, null, () => calls++);
  restoreBrowserPosition({ scrollTop: 0, top: 118 }, pane, () => calls++);
  assert.equal(pane.scrollTop, 0);
  assert.equal(calls, 0);
  assert.equal(captureBrowserPosition(null), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// Use the project's existing JSX compiler. This checks rendered accessibility
// and channel states without adding a test framework or launching a browser.
const compiler = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let ChannelList;
try { ({ default: ChannelList } = await compiler.ssrLoadModule('/src/ChannelList.jsx')); }
finally { await compiler.close(); }

const channels = [
  { key: 'alpha:main', name: 'Alpha TV', countryName: 'Germany', categories: ['news'] },
  { key: 'beta:main', name: 'Beta TV', countryName: 'Japan', categories: ['animation'], logo: 'https://example.com/logo.svg' },
];
function render(overrides = {}) {
  return renderToStaticMarkup(React.createElement(ChannelList, {
    channels, favorites: [], selectedKey: undefined, playback: 'idle', onSelect() {}, onToggleFavorite() {}, ...overrides,
  }));
}

test('each channel has independent native watch and favorite buttons with country and logo fallback', () => {
  const html = render();
  assert.match(html, /aria-label="Channel feeds"/);
  assert.equal((html.match(/class="channel-row /g) || []).length, 2);
  assert.match(html, /aria-label="Watch Alpha TV"/);
  assert.match(html, /aria-label="Save Alpha TV"/);
  assert.match(html, /Germany/);
  assert.match(html, /Japan/);
  assert.match(html, /lucide-tv/);
  assert.match(html, /src="https:\/\/example.com\/logo.svg"/);
  assert.doesNotMatch(html, /<video|\.m3u8/);
  assert.equal((html.match(/<button /g) || []).length, 4);
});

test('only the selected, actually playing channel claims Watching', () => {
  const html = render({ selectedKey: 'alpha:main', playback: 'playing' });
  assert.equal((html.match(/>Watching</g) || []).length, 1);
  assert.match(html, /aria-label="Watch Alpha TV" aria-pressed="true"/);
  assert.match(html, /aria-label="Watch Beta TV" aria-pressed="false"/);
  assert.doesNotMatch(render({ playback: 'playing' }), />Watching</);
});

test('connecting, paused, and failed selections remain selected without claiming playback', () => {
  for (const [playback, label] of [['loading', 'Connecting'], ['paused', 'Paused'], ['ready', 'Ready to play'], ['error', 'Stream unavailable']]) {
    const html = render({ selectedKey: 'alpha:main', playback });
    assert.match(html, /aria-label="Watch Alpha TV" aria-pressed="true"/);
    assert.ok(html.includes('>' + label + '<'));
    assert.doesNotMatch(html, />Watching</);
  }
});

test('favorite state is independent from selection', () => {
  const html = render({ selectedKey: 'alpha:main', favorites: ['beta:main'] });
  assert.match(html, /aria-label="Unsave Beta TV" aria-pressed="true"/);
  assert.match(html, /aria-label="Save Alpha TV" aria-pressed="false"/);
});

test('long names remain available in accessible labels and are escaped as text', () => {
  const name = 'A very long channel name <script>alert(1)<\/script> & more';
  const html = render({ channels: [{ key: 'long', name, country: 'US', categories: [] }] });
  assert.match(html, /Watch A very long channel name &lt;script&gt;/);
  assert.match(html, /title="A very long channel name/);
  assert.match(html, />US</);
  assert.match(html, />General</);
  assert.doesNotMatch(html, /<script>/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const compiler = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
let ChannelBrowserControls, DirectoryEmptyState;
try { ({ default: ChannelBrowserControls, DirectoryEmptyState } = await compiler.ssrLoadModule('/src/ChannelBrowserControls.jsx')); }
finally { await compiler.close(); }

const defaults = { filters: { search: 'English', category: 'news', country: 'DE' }, countries: [['DE', 'Germany']],
  dispatch() {}, resultCount: 1, favoritesOnly: true, loading: false, error: false };
const markup = (props = {}) => renderToStaticMarkup(React.createElement(ChannelBrowserControls, { ...defaults, ...props }));
// These components have no hooks. Inspect their native control callbacks to
// verify action wiring; this does not simulate keyboard, touch, or media events.
function findNative(node, predicate) {
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement(child)) continue;
    if (predicate(child)) return child;
    const match = findNative(child.props.children, predicate);
    if (match) return match;
  }
}

test('all applied filters have named removal controls and an accessible result count', () => {
  const html = markup();
  assert.match(html, /aria-label="Active channel filters"/);
  assert.match(html, /Remove Search:/);
  assert.match(html, /Remove Category: News/);
  assert.match(html, /Remove Country: Germany/);
  assert.match(html, />Clear filters</);
  assert.match(html, /1 favorite channel matches your filters\./);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /<video/);
});

test('removing a chip dispatches only that restriction, not collection navigation', () => {
  const actions = [];
  const tree = ChannelBrowserControls({ ...defaults, dispatch: action => actions.push(action) });
  findNative(tree, element => element.props['aria-label'] === 'Remove Country: Germany').props.onClick();
  assert.deepEqual(actions, [{ type: 'clear', field: 'country' }]);
});

test('search, category, and country controls use independent filter actions', () => {
  const actions = [];
  const tree = ChannelBrowserControls({ ...defaults, dispatch: action => actions.push(action) });
  findNative(tree, element => element.props['aria-label'] === 'Search channels').props.onChange({ target: { value: 'Anime' } });
  findNative(tree, element => element.type === 'button' && element.props.children === 'Animation').props.onClick();
  findNative(tree, element => element.props['aria-label'] === 'Filter by country').props.onChange({ target: { value: 'JP' } });
  assert.deepEqual(actions, [{ type: 'set', field: 'search', value: 'Anime' }, { type: 'set', field: 'category', value: 'animation' }, { type: 'set', field: 'country', value: 'JP' }]);
});

test('Clear filters dispatches a filter reset without changing the Favorites view', () => {
  const actions = [];
  const tree = ChannelBrowserControls({ ...defaults, dispatch: action => actions.push(action) });
  findNative(tree, element => element.type === 'button' && element.props.children === 'Clear filters').props.onClick();
  assert.deepEqual(actions, [{ type: 'reset' }]);
});

test('zero matching favorites offer a reset that never calls Browse all', () => {
  let clears = 0, browses = 0;
  const tree = DirectoryEmptyState({ favoritesOnly: true, favoritesCount: 2, hasFilters: true, onClearFilters: () => clears++, onBrowseAll: () => browses++ });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /No favorites match your filters/);
  findNative(tree, element => element.type === 'button').props.onClick();
  assert.equal(clears, 1);
  assert.equal(browses, 0);
});

test('an empty favorites collection offers discovery rather than a useless reset', () => {
  let browses = 0;
  const tree = DirectoryEmptyState({ favoritesOnly: true, favoritesCount: 0, hasFilters: false, onClearFilters() { throw new Error('Unexpected reset'); }, onBrowseAll: () => browses++ });
  assert.match(renderToStaticMarkup(tree), /Tap the heart on a channel/);
  findNative(tree, element => element.type === 'button').props.onClick();
  assert.equal(browses, 1);
});

test('loading and directory failures are not described as zero matching channels', () => {
  assert.match(markup({ loading: true }), /Loading channels/);
  assert.doesNotMatch(markup({ loading: true }), /1 favorite channel matches/);
  assert.match(markup({ error: true }), /Channel directory unavailable/);
  const html = markup({ filters: { search: '', category: 'all', country: 'all' }, favoritesOnly: false, resultCount: 2 });
  assert.doesNotMatch(html, /aria-label="Active channel filters"/);
  assert.match(html, /2 channels available/);
});

test('long queries are rendered as escaped text with full accessible removal names', () => {
  const html = markup({ filters: { search: '<script>alert(1)</script>' + 'x'.repeat(300), category: 'all', country: 'all' }, resultCount: 0 });
  assert.match(html, /Remove Search:/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /0 favorite channels match your filters/);
});

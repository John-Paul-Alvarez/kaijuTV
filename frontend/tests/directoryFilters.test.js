import test from 'node:test';
import assert from 'node:assert/strict';
import { activeDirectoryFilters, directoryFiltersReducer, filterDirectory, initialDirectoryFilters } from '../src/directoryFilters.js';

const channels = Object.freeze([
  Object.freeze({ key: 'alpha', name: 'World English', country: 'DE', countryName: 'Germany', categories: Object.freeze(['news']) }),
  Object.freeze({ key: 'beta', name: 'News English', country: 'US', countryName: 'United States', categories: Object.freeze(['news']) }),
  Object.freeze({ key: 'gamma', name: 'Anime Vision', country: 'DE', countryName: 'Germany', categories: Object.freeze(['animation']) }),
  Object.freeze({ key: 'delta', name: 'Animation Japan', country: 'JP', countryName: 'Japan', categories: Object.freeze(['animation']) }),
  Object.freeze({ key: 'epsilon', name: 'Culture Deutsch', country: 'DE', countryName: 'Germany', categories: Object.freeze(['news', 'documentary']) }),
]);
const keys = result => result.map(channel => channel.key);

test('search, category, and country intersect instead of overriding each other', () => {
  assert.deepEqual(keys(filterDirectory(channels, { search: 'english', category: 'news', country: 'DE' })), ['alpha']);
  assert.deepEqual(keys(filterDirectory(channels, { search: 'Germany', category: 'animation', country: 'DE' })), ['gamma']);
  assert.deepEqual(keys(filterDirectory(channels, { search: '', category: 'documentary', country: 'DE' })), ['epsilon']);
  assert.deepEqual(filterDirectory(channels, { search: 'English', category: 'news', country: 'JP' }), []);
});

test('queries trim whitespace, ignore letter case, and match country names or codes', () => {
  assert.deepEqual(keys(filterDirectory(channels, { ...initialDirectoryFilters, search: '  WORLD ENGLISH  ' })), ['alpha']);
  assert.deepEqual(keys(filterDirectory(channels, { ...initialDirectoryFilters, search: 'united states' })), ['beta']);
  assert.deepEqual(keys(filterDirectory(channels, { ...initialDirectoryFilters, search: 'jp' })), ['delta']);
  assert.equal(filterDirectory(channels, { ...initialDirectoryFilters, search: '   ' }).length, 5);
  assert.deepEqual(activeDirectoryFilters({ ...initialDirectoryFilters, search: '   ' }), []);
});

test('clearing every filter stays within Favorites rather than revealing unsaved channels', () => {
  const context = { view: 'favorites', favorites: ['gamma', 'delta'] };
  const filters = { search: 'Germany', category: 'animation', country: 'DE' };
  assert.deepEqual(keys(filterDirectory(channels, filters, context)), ['gamma']);
  const cleared = directoryFiltersReducer(filters, { type: 'reset' });
  assert.deepEqual(keys(filterDirectory(channels, cleared, context)), ['gamma', 'delta']);
  assert.deepEqual(filterDirectory(channels, cleared, { view: 'favorites', favorites: [] }), []);
});

test('filtering preserves catalogue order and original channel references', () => {
  const result = filterDirectory(channels, { ...initialDirectoryFilters, country: 'DE' });
  assert.deepEqual(keys(result), ['alpha', 'gamma', 'epsilon']);
  assert.equal(result[0], channels[0]);
  assert.equal(result[1], channels[2]);
  assert.notEqual(result, channels);
  assert.equal(channels.length, 5);
});

test('removing one chip keeps the other browsing choices unchanged', () => {
  const state = Object.freeze({ search: 'english', category: 'news', country: 'DE' });
  const result = directoryFiltersReducer(state, { type: 'clear', field: 'country' });
  assert.deepEqual(result, { search: 'english', category: 'news', country: 'all' });
  assert.deepEqual(keys(filterDirectory(channels, result)), ['alpha', 'beta']);
  assert.equal(state.country, 'DE');
});

test('active filters identify every restriction and show country names', () => {
  assert.deepEqual(activeDirectoryFilters({ search: '  English  ', category: 'news', country: 'DE' }, [['DE', 'Germany']]), [
    { field: 'search', label: 'Search: “English”' },
    { field: 'category', label: 'Category: News' },
    { field: 'country', label: 'Country: Germany' },
  ]);
  assert.equal(activeDirectoryFilters({ ...initialDirectoryFilters, country: 'ZZ' })[0].label, 'Country: ZZ');
});

test('selection actions cannot reset filters or introduce playback state into the reducer', () => {
  const state = { search: 'english', category: 'news', country: 'DE' };
  assert.equal(directoryFiltersReducer(state, { type: 'choose-channel', key: 'alpha' }), state);
  assert.equal(directoryFiltersReducer(state, { type: 'set', field: 'selected', value: 'alpha' }), state);
  assert.equal(directoryFiltersReducer(state, { type: 'set', field: 'search', value: 123 }), state);
  assert.equal(directoryFiltersReducer(state, { type: 'set', field: 'category', value: 'news' }), state);
});

test('setting a filter preserves the other restrictions and unknown values return no matches', () => {
  const state = directoryFiltersReducer(initialDirectoryFilters, { type: 'set', field: 'search', value: 'English' });
  const result = directoryFiltersReducer(state, { type: 'set', field: 'country', value: 'DE' });
  assert.deepEqual(result, { search: 'English', category: 'all', country: 'DE' });
  assert.deepEqual(filterDirectory(channels, { ...result, category: 'unavailable' }), []);
  assert.deepEqual(initialDirectoryFilters, { search: '', category: 'all', country: 'all' });
});

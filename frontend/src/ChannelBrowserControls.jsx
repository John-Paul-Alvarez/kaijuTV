import React from 'react';
import { Globe2, Search, Tv, X } from 'lucide-react';
import { activeDirectoryFilters } from './directoryFilters.js';

const categories = ['all', 'news', 'entertainment', 'movies', 'music', 'sports', 'documentary', 'animation'];
const label = text => text.charAt(0).toUpperCase() + text.slice(1);

export default function ChannelBrowserControls({ filters, countries, dispatch, resultCount, favoritesOnly, loading, error }) {
  const active = activeDirectoryFilters(filters, countries);
  const noun = favoritesOnly ? 'favorite channel' : 'channel';
  const count = `${resultCount} ${noun}${resultCount === 1 ? '' : 's'}`;
  const summary = loading ? 'Loading channels…' : error ? 'Channel directory unavailable.'
    : active.length ? `${count} ${resultCount === 1 ? 'matches' : 'match'} your filters.` : `${count} available.`;
  return <div className="browser-controls">
    <label className="search"><Search size={18} /><input aria-label="Search channels" placeholder="Search channels or countries…" value={filters.search} onChange={event => dispatch({ type: 'set', field: 'search', value: event.target.value })} />{filters.search && <button type="button" aria-label="Clear search" onClick={() => dispatch({ type: 'clear', field: 'search' })}><X size={16} /></button>}</label>
    <div className="filter-row">
      <div className="categories" role="group" aria-label="Channel category">{categories.map(category => <button type="button" aria-pressed={filters.category === category} className={filters.category === category ? 'active' : ''} key={category} onClick={() => dispatch({ type: 'set', field: 'category', value: category })}>{category === 'all' ? 'All' : label(category)}</button>)}</div>
      <label className="country-filter"><Globe2 size={16} /><select aria-label="Filter by country" value={filters.country} onChange={event => dispatch({ type: 'set', field: 'country', value: event.target.value })}><option value="all">All countries</option>{countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
    </div>
    {active.length > 0 && <div className="active-filters" role="group" aria-label="Active channel filters">
      <div className="active-filters-heading"><span>Filters ({active.length})</span><button type="button" className="clear-filters" onClick={() => dispatch({ type: 'reset' })}>Clear filters</button></div>
      <ul className="filter-chips" role="list">{active.map(filter => <li key={filter.field}><button type="button" className="filter-chip" title={filter.label} aria-label={`Remove ${filter.label}`} onClick={() => dispatch({ type: 'clear', field: filter.field })}><span>{filter.label}</span><X size={14} aria-hidden="true" /></button></li>)}</ul>
    </div>}
    <p className="filter-results-summary" role="status" aria-live="polite" aria-atomic="true">{summary}</p>
  </div>;
}

export function DirectoryEmptyState({ favoritesOnly, favoritesCount, hasFilters, onClearFilters, onBrowseAll }) {
  const emptyFavorites = favoritesOnly && favoritesCount === 0;
  const heading = emptyFavorites ? 'Keep your favorites close.' : hasFilters
    ? favoritesOnly ? 'No favorites match your filters.' : 'No channels match your filters.' : favoritesOnly ? 'No saved channels available.' : 'No channels available.';
  const explanation = emptyFavorites ? 'Tap the heart on a channel to save it here.' : hasFilters
    ? 'Try a different search or clear the filters to see more channels.' : 'Browse the directory to find a channel.';
  const canClear = !emptyFavorites && hasFilters;
  return <div className="empty-state"><Tv size={27} /><h3>{heading}</h3><p>{explanation}</p><button type="button" className="primary" onClick={canClear ? onClearFilters : onBrowseAll}>{canClear ? 'Clear filters' : 'Browse all channels'}</button></div>;
}

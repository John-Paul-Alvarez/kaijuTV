export const initialDirectoryFilters = Object.freeze({ search: '', category: 'all', country: 'all' });
const fields = ['search', 'category', 'country'];

// This state contains browsing choices only. Playback selection, source, and
// route stay with the viewing screen and are never changed by filter actions.
export function directoryFiltersReducer(state, action) {
  if (action.type === 'reset') return initialDirectoryFilters;
  if (!fields.includes(action.field)) return state;
  const value = action.type === 'clear' ? initialDirectoryFilters[action.field] : action.value;
  if (!['set', 'clear'].includes(action.type) || typeof value !== 'string' || state[action.field] === value) return state;
  return { ...state, [action.field]: value };
}

export function filterDirectory(channels, filters, { favorites = [], view = 'all' } = {}) {
  const query = filters.search.trim().toLowerCase();
  const saved = view === 'favorites' ? new Set(favorites) : null;
  return channels.filter(channel =>
    (!saved || saved.has(channel.key)) &&
    (filters.category === 'all' || channel.categories?.includes(filters.category)) &&
    (filters.country === 'all' || channel.country === filters.country) &&
    `${channel.name || ''} ${channel.countryName || ''} ${channel.country || ''}`.toLowerCase().includes(query)
  );
}

export function activeDirectoryFilters(filters, countries = []) {
  const active = [];
  const query = filters.search.trim();
  if (query) active.push({ field: 'search', label: `Search: “${query}”` });
  if (filters.category !== 'all') active.push({ field: 'category', label: `Category: ${filters.category.charAt(0).toUpperCase() + filters.category.slice(1)}` });
  if (filters.country !== 'all') active.push({ field: 'country', label: `Country: ${countries.find(([code]) => code === filters.country)?.[1] || filters.country}` });
  return active;
}

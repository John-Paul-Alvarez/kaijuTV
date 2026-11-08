import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, ChevronRight, Globe2, Heart, Radio, Search, Tv, X, RefreshCw } from 'lucide-react';
import { loadCatalog } from './catalog';
import Player from './Player';
import StreamDiagnostics from './StreamDiagnostics';
import { defaultRelay } from './relayClient';
import { playbackPresentation } from './playbackPresentation';
import ChannelList from './ChannelList';
import { captureBrowserPosition, restoreBrowserPosition } from './browserPosition';
import './styles.css';

const categories = ['all', 'news', 'entertainment', 'movies', 'music', 'sports', 'documentary', 'animation'];
const label = text => text.charAt(0).toUpperCase() + text.slice(1);
function readFavorites() { try { const value = JSON.parse(localStorage.getItem('kaiju-favorites') || '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []; } catch { return []; } }

// Browsing state does not belong to the playback surface. Stable source and
// callback props keep the current player mounted across directory interactions.
const PlaybackSurface = React.memo(Player);

function App() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [country, setCountry] = useState('all');
  const [view, setView] = useState('all');
  const [limit, setLimit] = useState(24);
  const [favorites, setFavorites] = useState(readFavorites);
  const [selected, setSelected] = useState(null);
  const [streamIndex, setStreamIndex] = useState(0);
  const [playback, setPlayback] = useState('idle');
  const [browserError, setBrowserError] = useState(null);
  const [useRelay, setUseRelay] = useState(false);
  const browserResultsRef = useRef(null);
  const pendingBrowserPosition = useRef(null);
  const onStatus = useCallback(value => setPlayback(value), []);

  useLayoutEffect(() => {
    const position = pendingBrowserPosition.current;
    pendingBrowserPosition.current = null;
    restoreBrowserPosition(position, browserResultsRef.current);
  }, [selected?.key]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    let active = true;
    setLoading(true); setError('');
    loadCatalog(controller.signal).then(data => {
      if (!active) return;
      if (!data.length) throw new Error('No compatible channels were returned.');
      setChannels(data);
    }).catch(() => { if (active) setError('We couldn’t reach the channel directory. Check your connection and try again.'); })
      .finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [reload]);

  useEffect(() => { try { localStorage.setItem('kaiju-favorites', JSON.stringify(favorites)); } catch { /* Existing storage behaviour; migration belongs to KTV-06. */ } }, [favorites]);
  useEffect(() => setLimit(24), [search, category, country, view]);
  const countries = useMemo(() => [...new Map(channels.map(item => [item.country, item.countryName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [channels]);
  const filtered = useMemo(() => channels.filter(item =>
    (view !== 'favorites' || favorites.includes(item.key)) &&
    (category === 'all' || item.categories.includes(category)) &&
    (country === 'all' || item.country === country) &&
    `${item.name} ${item.countryName}`.toLowerCase().includes(search.trim().toLowerCase())
  ), [channels, view, favorites, category, country, search]);

  const presentation = playbackPresentation(selected, playback);

  const choose = useCallback(channel => {
    if (selected?.key === channel.key) return;
    pendingBrowserPosition.current = captureBrowserPosition(browserResultsRef.current);
    setPlayback('loading');
    setBrowserError(null);
    setSelected(channel);
    setStreamIndex(0);
    setUseRelay(defaultRelay(channel.streams[0]?.url));
  }, [selected?.key]);
  const changeRoute = useCallback(value => { setPlayback('loading'); setUseRelay(value); }, []);
  function changeSource(event) {
    const index = Number(event.target.value);
    setPlayback('loading'); setBrowserError(null);
    setStreamIndex(index); setUseRelay(defaultRelay(selected.streams[index]?.url));
  }
  const toggleFavorite = useCallback(key => { setFavorites(previous => previous.includes(key) ? previous.filter(item => item !== key) : [...previous, key]); }, []);
  function resetFilters() { setSearch(''); setCategory('all'); setCountry('all'); }
  function openView(next) { setView(next); if (next === 'favorites') resetFilters(); }

  return <>
    <a className="skip-link" href="#watch">Skip to player</a>
    <header className="app-bar">
      <a className="brand" href="#watch" aria-label="KaijuTV home" onClick={() => { setView('all'); resetFilters(); }}>
        <span>Kaiju<span className="brand-tv">TV</span></span><img src="/favicon.svg" alt="" />
      </a>
      <span className="app-bar-note"><span className="green-dot" /> A WORLD OF LIVE TV</span>
      <span className="prototype">PROTOTYPE</span>
    </header>

    <div className="app-layout">
      <aside className="navigation-rail">
        <span className="rail-label">YOUR TELEVISION</span>
        <nav aria-label="Main navigation">
          <button aria-current={view === 'all' ? 'page' : undefined} className={view === 'all' ? 'nav-active' : ''} onClick={() => openView('all')}><Tv size={19} /> Live TV</button>
          <button aria-current={view === 'favorites' ? 'page' : undefined} className={view === 'favorites' ? 'nav-active' : ''} onClick={() => openView('favorites')}><Heart size={19} /> Favorites <span className="count">{favorites.length}</span></button>
        </nav>
        <div className="rail-footnote"><Globe2 size={20} /><p>Big world.<br /><strong>Pick your signal.</strong></p></div>
      </aside>

      <main className="viewing-main">
        <h1 className="visually-hidden">KaijuTV live television</h1>
        <div className="viewing-layout">
          <section className="watch-column" id="watch" aria-label="Watch live television" tabIndex={-1}>
            <div className="watch-heading">
              <h2><Radio size={16} /> Your front-row seat</h2>
              <span className={`playback-status status-${presentation.tone}`} role="status" aria-live="polite">{presentation.live && <span className="green-dot" />}{presentation.label}</span>
            </div>
            <div className="player-shell">
              <PlaybackSurface channel={selected} streamIndex={streamIndex} onStatus={onStatus} onErrorReport={setBrowserError} useRelay={useRelay} onUseRelay={changeRoute} />
              <div className="now-playing">
                <div className="now-icon"><Radio size={20} /></div>
                <div className="now-copy">
                  <span className="eyebrow">{presentation.live ? 'NOW PLAYING' : selected ? 'SELECTED CHANNEL' : 'READY TO EXPLORE'}</span>
                  <h3>{selected?.name || 'Your next channel is right here.'}</h3>
                  <p>{selected ? `${selected.countryName} · ${selected.categories.map(label).join(' / ')}` : 'Choose a channel from the directory to start watching.'}</p>
                </div>
                {selected && <button className={`icon-button ${favorites.includes(selected.key) ? 'saved' : ''}`} aria-label={favorites.includes(selected.key) ? 'Remove selected channel from favorites' : 'Save selected channel'} aria-pressed={favorites.includes(selected.key)} onClick={() => toggleFavorite(selected.key)}><Heart size={21} fill={favorites.includes(selected.key) ? 'currentColor' : 'none'} /></button>}
              </div>
              {selected && <div className="playback-options" aria-label="Playback options">
                <label><span>Playback route</span><select aria-label="Playback route" value={useRelay ? 'relay' : 'direct'} onChange={event => changeRoute(event.target.value === 'relay')}><option value="direct">Direct playback</option><option value="relay">Backend relay</option></select></label>
                {selected.streams.length > 1 && <label><span>Stream source</span><select aria-label="Stream source" value={streamIndex} onChange={changeSource}>{selected.streams.map((source, index) => <option key={source.url} value={index}>Source {index + 1}{source.quality ? ` · ${source.quality}` : ''}</option>)}</select></label>}
              </div>}
              <div className="player-note"><span><span className="green-dot" /> {selected ? 'Starts muted. Use the player controls for sound.' : 'Pick a channel. Make yourself at home.'}</span></div>
              <StreamDiagnostics channel={selected} streamIndex={streamIndex} browserError={browserError} />
            </div>
            <div className="viewing-footnote"><p>Stream availability varies by channel and region.</p><a href="https://github.com/iptv-org/iptv" target="_blank" rel="noreferrer">Directory by IPTV-org <ArrowUpRight size={13} /></a></div>
          </section>

          <section className="channel-browser" aria-labelledby="directory-title">
            <div className="directory-heading">
              <div><span className="eyebrow">FIND YOUR FREQUENCY</span><h2 id="directory-title">{view === 'favorites' ? 'Favorites' : 'Channels'}<span className="result-count">{loading ? '…' : filtered.length.toLocaleString()}</span></h2></div>
              <Globe2 size={23} aria-hidden="true" />
            </div>
            <label className="search"><Search size={18} /><input aria-label="Search channels" placeholder="Search channels or countries…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={16} /></button>}</label>
            <div className="filter-row">
              <div className="categories" role="group" aria-label="Channel category">{categories.map(item => <button aria-pressed={category === item} className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>{item === 'all' ? 'All' : label(item)}</button>)}</div>
              <label className="country-filter"><Globe2 size={16} /><select aria-label="Filter by country" value={country} onChange={event => setCountry(event.target.value)}><option value="all">All countries</option>{countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
            </div>
            <div className="directory-results" ref={browserResultsRef}>
              {loading ? <div className="empty-state" role="status"><RefreshCw className="spin" size={25} /><h3>Finding your channels…</h3><p>Loading the live TV directory.</p></div>
                : error ? <div className="empty-state" role="alert"><Radio size={26} /><h3>The directory is out of reach.</h3><p>{error}</p><button className="primary" onClick={() => setReload(value => value + 1)}><RefreshCw size={15} /> Retry directory</button></div>
                : filtered.length === 0 ? <div className="empty-state"><Tv size={27} /><h3>{view === 'favorites' && favorites.length === 0 ? 'Keep your favorites close.' : 'No channels found.'}</h3><p>{view === 'favorites' && favorites.length === 0 ? 'Tap the heart on a channel to save it here.' : 'Try another search, category, or country.'}</p><button className="primary" onClick={() => { resetFilters(); if (view === 'favorites') setView('all'); }}>Browse all channels</button></div>
                : <>
                  <ChannelList channels={filtered.slice(0, limit)} selectedKey={selected?.key} playback={playback} favorites={favorites} onSelect={choose} onToggleFavorite={toggleFavorite} />
                  <div className="browse-more"><p>Showing {Math.min(limit, filtered.length)} of {filtered.length.toLocaleString()} feeds</p>{limit < filtered.length && <button onClick={() => setLimit(value => value + 24)}>Load more channels <ChevronRight size={16} /></button>}</div>
                </>}
            </div>
          </section>
        </div>
      </main>
    </div>
  </>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);

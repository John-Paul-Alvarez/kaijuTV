import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, ChevronRight, Globe2, Heart, Play, Radio, Search, Tv, X, RefreshCw } from 'lucide-react';
import { loadCatalog } from './catalog';
import Player from './Player';
import StreamDiagnostics from './StreamDiagnostics';
import { defaultRelay } from './relayClient';
import './styles.css';

const categories = ['all', 'news', 'entertainment', 'movies', 'music', 'sports', 'documentary', 'animation'];
const label = text => text.charAt(0).toUpperCase() + text.slice(1);
function readFavorites() { try { const value = JSON.parse(localStorage.getItem('kaiju-favorites') || '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []; } catch { return []; } }

function ChannelLogo({ channel }) {
  const [broken, setBroken] = useState(false);
  return <span className="channel-logo">{channel.logo && !broken ? <img src={channel.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <Tv size={25} />}</span>;
}

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
  const onStatus = useCallback(value => setPlayback(value), []);

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

  useEffect(() => { try { localStorage.setItem('kaiju-favorites', JSON.stringify(favorites)); } catch { /* Storage may be unavailable in private browsing. */ } }, [favorites]);
  useEffect(() => setLimit(24), [search, category, country, view]);
  const countries = useMemo(() => [...new Map(channels.map(item => [item.country, item.countryName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [channels]);
  const filtered = useMemo(() => channels.filter(item =>
    (view !== 'favorites' || favorites.includes(item.key)) &&
    (category === 'all' || item.categories.includes(category)) &&
    (country === 'all' || item.country === country) &&
    `${item.name} ${item.countryName}`.toLowerCase().includes(search.trim().toLowerCase())
  ), [channels, view, favorites, category, country, search]);
  const picks = useMemo(() => { const seen = new Set(); return channels.filter(item => { if (seen.has(item.channelId)) return false; seen.add(item.channelId); return true; }).slice(0, 4); }, [channels]);
  function choose(channel) { setSelected(channel); setStreamIndex(0); setUseRelay(defaultRelay(channel.streams[0]?.url)); setPlayback('loading'); document.getElementById('watch').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function toggleFavorite(key) { setFavorites(previous => previous.includes(key) ? previous.filter(item => item !== key) : [...previous, key]); }
  function resetFilters() { setSearch(''); setCategory('all'); setCountry('all'); }

  return <>
    <header className="header"><div className="header-inner">
      <a className="brand" href="#" aria-label="KaijuTV home" onClick={() => { setView('all'); resetFilters(); }}><img src="/favicon.svg" alt="" /><span>KAIJU<span className="brand-tv">TV</span><small>A BIGGER WORLD OF TELEVISION</small></span></a>
      <nav aria-label="Main navigation"><button className={view === 'all' ? 'nav-active' : ''} onClick={() => setView('all')}><Radio size={16} /> Live TV</button><button className={view === 'favorites' ? 'nav-active' : ''} onClick={() => { setView('favorites'); resetFilters(); }}><Heart size={16} /> My channels {favorites.length > 0 && <span className="count">{favorites.length}</span>}</button></nav>
      <span className="prototype">EARLY ACCESS <span>v0.1</span></span>
    </div></header>

    <main>
      <section className="page-heading"><div><span className="eyebrow"><span className="green-dot" /> THE WORLD IS WATCHING</span><h1>Go big. <span>Tune in.</span></h1><p>A monster-sized world of live TV. One place to explore it.</p></div><div className="world-count"><Globe2 size={22} /><span><strong>{loading ? '—' : countries.length}</strong> countries. Countless perspectives.</span></div></section>

      <section className="watch-layout" id="watch" aria-label="Watch live television">
        <div className="player-shell"><Player channel={selected} streamIndex={streamIndex} onStatus={onStatus} onErrorReport={setBrowserError} useRelay={useRelay} onUseRelay={setUseRelay} />
          <div className="now-playing"><div className="now-icon"><Radio size={19} /></div><div className="now-copy"><span className="eyebrow">{selected ? (playback === 'playing' ? 'NOW PLAYING' : 'SELECTED CHANNEL') : 'YOUR FRONT-ROW SEAT'}</span><h3>{selected?.name || 'A whole world is on air.'}</h3><p>{selected ? `${selected.countryName} · ${selected.categories.map(label).join(' / ')}` : 'Choose a channel below to start watching.'}</p></div>
            {selected && <div className="player-actions"><select aria-label="Playback route" value={useRelay ? 'relay' : 'direct'} onChange={event => setUseRelay(event.target.value === 'relay')}><option value="direct">Direct playback</option><option value="relay">Backend relay</option></select>{selected.streams.length > 1 && <select aria-label="Stream source" value={streamIndex} onChange={event => { const index = Number(event.target.value); setStreamIndex(index); setUseRelay(defaultRelay(selected.streams[index]?.url)); }}>{selected.streams.map((source, index) => <option key={source.url} value={index}>Source {index + 1}{source.quality ? ` · ${source.quality}` : ''}</option>)}</select>}<button className={`icon-button ${favorites.includes(selected.key) ? 'saved' : ''}`} aria-label={favorites.includes(selected.key) ? 'Remove selected channel from favorites' : 'Save selected channel'} onClick={() => toggleFavorite(selected.key)}><Heart size={19} fill={favorites.includes(selected.key) ? 'currentColor' : 'none'} /></button></div>}
          </div><div className="player-note"><span><span className="green-dot" /> {selected ? 'Starts muted. Use the player controls for sound.' : 'Live streams. No schedule required.'}</span><span>POWERED BY IPTV-ORG <ArrowUpRight size={12} /></span></div>
          <StreamDiagnostics channel={selected} streamIndex={streamIndex} browserError={browserError} />
        </div>
        <aside className="picks"><div className="picks-heading"><span className="eyebrow">FIRST CONTACT</span><h2>Start exploring<span>↗</span></h2><p>A few signals from around the world.</p></div><div className="pick-list">{loading ? <div className="loading-picks"><RefreshCw className="spin" size={19} /> Finding channels…</div> : picks.map((channel, index) => <button className={`pick ${selected?.key === channel.key ? 'pick-selected' : ''}`} key={channel.key} onClick={() => choose(channel)}><span className="pick-number">0{index + 1}</span><ChannelLogo channel={channel} /><span className="pick-copy"><strong>{channel.name}</strong><small>{channel.countryName}</small></span><Play size={14} /></button>)}</div><div className="picks-bottom"><Globe2 size={28} /><p>Different time zones.<br /><strong>Same curiosity.</strong></p></div></aside>
      </section>

      <section className="directory" aria-labelledby="directory-title"><div className="directory-heading"><div><span className="eyebrow">CHANNEL SURFING, EVOLVED</span><h2 id="directory-title">{view === 'favorites' ? 'Your channel collection' : 'Find your frequency'}<span className="result-count">{loading ? '…' : filtered.length.toLocaleString()}</span></h2></div><label className="search"><Search size={17} /><input aria-label="Search channels" placeholder="Search channels or countries…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={15} /></button>}</label></div>
        <div className="filter-row"><div className="categories" role="group" aria-label="Channel category">{categories.map(item => <button aria-pressed={category === item} className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>{item === 'all' ? <><Tv size={14} /> All channels</> : label(item)}</button>)}</div><label className="country-filter"><Globe2 size={15} /><select aria-label="Filter by country" value={country} onChange={event => setCountry(event.target.value)}><option value="all">All countries</option>{countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label></div>
        {loading ? <div className="empty-state" role="status"><RefreshCw className="spin" /><h3>Scanning the airwaves…</h3><p>Loading the latest channel directory.</p></div> : error ? <div className="empty-state" role="alert"><h3>Lost the signal.</h3><p>{error}</p><button className="primary" onClick={() => setReload(value => value + 1)}><RefreshCw size={15} /> Try again</button></div> : filtered.length === 0 ? <div className="empty-state"><Tv size={30} /><h3>{view === 'favorites' && favorites.length === 0 ? 'Make yourself at home.' : 'No channels on this frequency.'}</h3><p>{view === 'favorites' && favorites.length === 0 ? 'Tap the heart on any channel to save it here.' : 'Try a different search, category, or country.'}</p><button className="primary" onClick={() => { resetFilters(); if (view === 'favorites') setView('all'); }}>Explore channels</button></div> : <>
          <div className="channel-grid">{filtered.slice(0, limit).map((channel, index) => <article className={`channel-card tone-${index % 6} ${selected?.key === channel.key ? 'selected' : ''}`} key={channel.key}><button className="channel-play" aria-label={`Watch ${channel.name}`} onClick={() => choose(channel)}><div className="card-art"><span className="card-category">{label(channel.categories[0])}</span><ChannelLogo channel={channel} /><span className="card-watermark">{channel.country}</span><span className="play-circle"><Play size={18} fill="currentColor" /></span><span className="quality">{channel.streams[0].quality || 'TV'}</span></div><div className="card-info"><h3>{channel.name}</h3><p>{channel.countryName}<span>{selected?.key === channel.key && playback === 'playing' ? '● Watching' : 'Live channel'}</span></p></div></button><button className={`favorite-button ${favorites.includes(channel.key) ? 'saved' : ''}`} aria-label={`${favorites.includes(channel.key) ? 'Unsave' : 'Save'} ${channel.name}`} aria-pressed={favorites.includes(channel.key)} onClick={() => toggleFavorite(channel.key)}><Heart size={16} fill={favorites.includes(channel.key) ? 'currentColor' : 'none'} /></button></article>)}</div>
          <div className="browse-more"><p>Showing {Math.min(limit, filtered.length)} of {filtered.length.toLocaleString()} channel feeds</p>{limit < filtered.length && <button onClick={() => setLimit(value => value + 24)}>More to discover <ChevronRight size={17} /></button>}</div>
        </>}
      </section>
      <footer><a className="footer-brand" href="#">KAIJU<span>TV</span></a><p>Big world. Bigger curiosity.</p><a href="https://github.com/iptv-org/iptv" target="_blank" rel="noreferrer">Channel directory by IPTV-org <ArrowUpRight size={13} /></a><small>Stream availability varies by channel and region.</small></footer>
    </main>
  </>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);

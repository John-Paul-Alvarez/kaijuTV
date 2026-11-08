import React, { memo, useState } from 'react';
import { Heart, Play, Radio, Tv } from 'lucide-react';
import { playbackPresentation } from './playbackPresentation.js';

function ChannelLogo({ channel }) {
  // Track the failed URL, so refreshed artwork can be tried without remounting
  // the channel row or disturbing the viewer's place in the list.
  const [failedLogo, setFailedLogo] = useState(null);
  return <span className="row-logo" aria-hidden="true">
    {channel.logo && failedLogo !== channel.logo
      ? <img src={channel.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedLogo(channel.logo)} />
      : <Tv size={22} />}
  </span>;
}

const ChannelRow = memo(function ChannelRow({ channel, selected, playback, favorite, onSelect, onToggleFavorite }) {
  const presentation = playbackPresentation(selected ? channel : null, playback);
  const category = channel.categories?.[0] || 'general';
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  const name = channel.name || 'Unnamed channel';
  return <li className={`channel-row ${selected ? 'selected' : ''}`}>
    <button type="button" className="row-play" aria-label={`Watch ${name}`} aria-pressed={selected} onClick={() => onSelect(channel)}>
      <ChannelLogo channel={channel} />
      <span className="row-copy">
        <strong className="row-name" title={name}>{name}</strong>
        <span className="row-country">{channel.countryName || channel.country || 'Country unavailable'}</span>
        <span className={`row-state ${selected && presentation.live ? 'is-watching' : ''}`}>{selected ? presentation.live ? 'Watching' : presentation.label : categoryLabel}</span>
      </span>
      <span className={`row-signal ${selected && presentation.live ? 'is-watching' : ''}`} aria-hidden="true">{selected && presentation.live ? <Radio size={18} /> : <Play size={17} />}</span>
    </button>
    <button type="button" className={`row-favorite ${favorite ? 'saved' : ''}`} aria-label={`${favorite ? 'Unsave' : 'Save'} ${name}`} aria-pressed={favorite} onClick={() => onToggleFavorite(channel.key)}><Heart size={19} fill={favorite ? 'currentColor' : 'none'} /></button>
  </li>;
});

export default function ChannelList({ channels, selectedKey, playback, favorites, onSelect, onToggleFavorite }) {
  return <ul className="channel-list" role="list" aria-label="Channel feeds">
    {channels.map(channel => <ChannelRow key={channel.key} channel={channel} selected={channel.key === selectedKey} playback={channel.key === selectedKey ? playback : 'idle'} favorite={favorites.includes(channel.key)} onSelect={onSelect} onToggleFavorite={onToggleFavorite} />)}
  </ul>;
}

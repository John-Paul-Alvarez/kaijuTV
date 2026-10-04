const BASE = 'https://iptv-org.github.io/api';

async function get(name, signal) {
  const response = await fetch(`${BASE}/${name}.json`, { signal });
  if (!response.ok) throw new Error(`Channel directory returned ${response.status}.`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('The channel directory has an unexpected format.');
  return data;
}

export function assembleCatalog(channels, streams, logos = [], countries = []) {
  const channelMap = new Map(channels.map(channel => [channel.id, channel]));
  const countryMap = new Map(countries.map(country => [country.code, country.name]));
  const logoMap = new Map();
  for (const logo of logos) {
    const key = `${logo.channel}:${logo.feed || 'main'}`;
    const existing = logoMap.get(key);
    if (logo.url?.startsWith('https://') && (!existing || (!existing.in_use && logo.in_use))) logoMap.set(key, logo);
  }
  const groups = new Map();
  for (const stream of streams) {
    const channel = channelMap.get(stream.channel);
    if (!channel || channel.is_nsfw || channel.closed || stream.user_agent || stream.referrer) continue;
    if (!/^https:\/\/.+\.m3u8(?:[?#]|$)/i.test(stream.url)) continue;
    const key = `${channel.id}:${stream.feed || 'main'}`;
    if (!groups.has(key)) groups.set(key, {
      key, channelId: channel.id, name: stream.title || channel.name,
      country: channel.country, countryName: countryMap.get(channel.country) || channel.country,
      categories: channel.categories?.length ? channel.categories : ['general'],
      logo: (logoMap.get(key) || logoMap.get(`${channel.id}:main`))?.url, streams: [],
    });
    const item = groups.get(key);
    if (!item.streams.some(source => source.url === stream.url)) item.streams.push(stream);
  }
  const priority = ['DW.de', 'France24.fr', 'NHKWorldJapan.jp', 'AlJazeera.qa', 'ArirangTV.kr', 'NASAPlus.us'];
  const rank = item => {
    const index = priority.indexOf(item.channelId);
    return index < 0 ? 100 : index + (/english/i.test(item.name) ? -0.5 : 0);
  };
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export async function loadCatalog(signal) {
  const results = await Promise.allSettled(['channels', 'streams', 'logos', 'countries'].map(name => get(name, signal)));
  for (const result of results.slice(0, 2)) if (result.status === 'rejected') throw result.reason;
  return assembleCatalog(...results.map(result => result.status === 'fulfilled' ? result.value : []));
}

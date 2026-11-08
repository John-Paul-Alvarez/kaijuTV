// A channel selection is not evidence of playback. Only Player's playing event
// permits Live / Watching; every other state has an explicit neutral label.
export function playbackPresentation(channel, state) {
  if (!channel) return { label: 'Choose a channel', tone: 'idle', live: false };
  if (state === 'playing') return { label: 'Live', tone: 'live', live: true };
  if (state === 'loading') return { label: 'Connecting', tone: 'loading', live: false };
  if (state === 'paused') return { label: 'Paused', tone: 'paused', live: false };
  if (state === 'ready') return { label: 'Ready to play', tone: 'idle', live: false };
  if (state === 'error') return { label: 'Stream unavailable', tone: 'error', live: false };
  return { label: 'Selected', tone: 'idle', live: false };
}

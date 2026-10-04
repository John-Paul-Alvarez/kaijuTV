// Only classify evidence the player actually reports. A hidden/zero HTTP status
// cannot distinguish CORS, DNS, TLS, a disconnected network, or a blocked request.
export function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.username = ''; url.password = ''; url.hash = '';
    const hadQuery = Boolean(url.search);
    url.search = '';
    return `${url.href}${hadQuery ? '?[query hidden]' : ''}`;
  } catch { return '(URL not available)'; }
}

function safeMessage(value) {
  return String(value || '').replace(/https?:\/\/[^\s"'<>]+/g, safeUrl).slice(0, 1200);
}

function requestStage(code) {
  if (code === 'MEDIA_ERR_4') return 'Media source';
  if (code === 'MEDIA_ERR_2') return 'Media request';
  if (code === 'MEDIA_ERR_3') return 'Media decoding';
  if (/manifest/i.test(code)) return 'Channel manifest';
  if (/level|audioTrack|subtitle/i.test(code)) return 'Media playlist';
  if (/frag/i.test(code)) return 'Video/audio segment';
  if (/keyLoad|decrypt|keySystem/i.test(code)) return 'Encryption / license';
  if (/buffer|codec|media/i.test(code)) return 'Video decoding / buffer';
  return 'Playback';
}

export function describePlaybackError({ kind = 'hls', data = {}, mediaError, exception, source, sourceNumber = 1, labels = [] } = {}) {
  const code = kind === 'native' ? `MEDIA_ERR_${mediaError?.code || 'UNKNOWN'}` :
    kind === 'play' ? exception?.name || 'PlayError' :
    kind === 'unsupported' ? 'HLS_NOT_SUPPORTED' :
    kind === 'timeout' ? 'PLAYBACK_TIMEOUT' : data.details || 'UNKNOWN_PLAYBACK_ERROR';
  const rawStatus = data.response?.code ?? data.networkDetails?.status;
  const status = Number(rawStatus);
  const httpStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
  const detail = data.details || code;
  const type = data.type || (kind === 'native' ? 'HTML video error' : kind === 'timeout' ? 'Playback timeout' : kind === 'play' ? 'Play request error' : 'Browser support');
  const requestUrl = data.url || data.response?.url || data.context?.url || data.frag?.url || data.networkDetails?.responseURL;
  let title = 'Playback failed';
  let explanation = 'The player reported an error. The technical details below are the evidence available from this browser.';
  let nextStep = 'Try another source for this channel and compare the same source in VLC.';
  let backend = 'More diagnostics are needed before deciding whether a backend would help.';

  if (kind === 'relay') {
    title = 'The backend relay could not start';
    explanation = 'The relay session could not be created. The error below comes from the backend connection or source validation.';
    nextStep = 'Check that the backend is running, then retry or try another source.';
    backend = 'The relay has not started forwarding media. Resolve the reported backend error first.';
  } else if (kind === 'unsupported') {
    title = 'This browser cannot run the HLS player';
    explanation = 'Neither native HLS playback nor the media features required by hls.js are available.';
    nextStep = 'Try a current browser that supports HLS or Media Source Extensions.';
    backend = 'A relay alone does not add media-player support to the browser.';
  } else if (kind === 'play') {
    title = exception?.name === 'NotSupportedError' ? 'The browser rejected this media source' : 'The browser could not start playback';
    explanation = exception?.name === 'NotAllowedError' ? 'The browser requires a direct play action or permission before playback can start.' : 'The video play request was rejected. The exception below identifies what the browser reported.';
    nextStep = exception?.name === 'NotAllowedError' ? 'Press Play channel to start manually.' : nextStep;
    backend = exception?.name === 'NotAllowedError' ? 'This is a browser playback-permission issue; a media relay would not fix it.' : 'Check the media format and codec before considering conversion.';
  } else if (httpStatus === 401 || httpStatus === 403) {
    title = `Stream server refused access (HTTP ${httpStatus})`;
    explanation = 'The requested stream resource returned an access error. This alone does not prove a regional block, expired link, or login requirement.';
    nextStep = 'Try another source. Check the broadcaster’s official viewing options.';
    backend = 'A backend can compare permitted server access, but relaying does not guarantee access or replace required authorization.';
  } else if (httpStatus === 404 || httpStatus === 410) {
    title = `Stream resource not found (HTTP ${httpStatus})`;
    explanation = 'The server reported that the requested playlist or media resource is missing or gone.';
    backend = 'A relay cannot restore a missing resource. The source link may need updating.';
  } else if (httpStatus === 429) {
    title = 'Stream server is limiting requests (HTTP 429)';
    explanation = 'The server rejected this request because of rate limiting.';
    nextStep = 'Wait before retrying, or choose another source.';
    backend = 'Caching and slower request rates may help; relaying can also concentrate requests and make the limit worse.';
  } else if (httpStatus >= 500) {
    title = `Stream server error (HTTP ${httpStatus})`;
    explanation = 'The stream server returned an error response.';
    backend = 'A relay will not fix an upstream server failure. Another source may work.';
  } else if (/incompatiblecodecs|addcodec/i.test(detail)) {
    title = 'Video or audio codec is incompatible';
    explanation = 'The player reported an unsupported codec or a failure while creating its media buffer.';
    backend = 'Conversion could help if incompatibility is confirmed. A simple relay does not change codecs.';
  } else if (/parsing|levelEmpty/i.test(detail)) {
    title = 'The player could not read the stream data';
    explanation = 'A playlist or media segment could not be parsed, or a playlist contained no usable segments. The response might be invalid or an error page.';
    backend = 'Inspect the response first. A relay alone does not repair invalid playlists or media.';
  } else if (/keySystem|decrypt|keyLoad/i.test(detail)) {
    title = 'Stream encryption or key request failed';
    explanation = 'The player could not obtain or use a required media key or license. This does not by itself establish which access requirement applies.';
    backend = 'A backend cannot replace required licenses or access rights. Prefer an authorized source or official player.';
  } else if (kind === 'native') {
    const native = {
      1: ['Playback was aborted', 'The browser reported that media loading was interrupted.'],
      2: ['The browser reported a media network error', 'The native video player could not load media. It did not expose an HTTP status or confirm the network cause.'],
      3: ['The browser could not decode the media', 'Media decoding failed. Unsupported encoding or damaged media are possibilities, not confirmed diagnoses.'],
      4: ['The browser could not use this media source', 'The browser reported an unsupported or unusable source. Format, codec, and access issues need further checking.'],
    };
    [title, explanation] = native[mediaError?.code] || [title, explanation];
    backend = mediaError?.code === 2 ? 'Compare access from a backend. A relay may help browser-specific request restrictions if server access succeeds.' : 'Inspect the source and codec. A relay does not change media encoding.';
  } else if (kind === 'timeout' || /timeout/i.test(detail)) {
    title = kind === 'timeout' ? 'Playback did not start or resume within 20 seconds' : 'A stream request timed out';
    explanation = 'The player reached its waiting limit. Slow delivery, an unreachable resource, or a stalled player are possible; the timeout alone cannot identify the cause.';
    backend = 'Compare server reachability and timing. A relay only helps if the backend can obtain usable media.';
  } else if (data.type === 'networkError') {
    title = httpStatus ? `Stream request failed (HTTP ${httpStatus})` : 'Stream request failed — cause unconfirmed';
    explanation = httpStatus ? 'The stream request returned an HTTP response; its status is shown below.' : 'The browser exposed no HTTP response status. CORS, connectivity, DNS/TLS, or request blocking are possible; the player cannot distinguish them.';
    nextStep = 'Try another source. Check the browser’s Network and Console panels for additional evidence.';
    backend = 'A backend can compare reachability. A relay may help a browser access restriction, but only if server access succeeds.';
  } else if (/buffer|media/i.test(detail) || data.type === 'mediaError' || data.type === 'muxError') {
    title = 'The player could not process or buffer the media';
    explanation = 'The player reported a media-processing error. Codec compatibility, damaged segments, or a stalled buffer need checking.';
    backend = 'Inspect the actual media and codecs. Conversion may help a confirmed incompatibility; relaying alone may not.';
  }

  return {
    title, explanation, nextStep, backend, code, type,
    stage: kind === 'relay' ? 'Backend relay setup' : requestStage(detail),
    httpStatus,
    httpLabel: httpStatus ? String(httpStatus) : rawStatus === 0 ? '0 — no response exposed' : 'Not exposed by the player',
    message: safeMessage(data.reason || data.error?.message || mediaError?.message || exception?.message || (kind === 'timeout' ? '20-second playback deadline exceeded.' : 'No additional message reported.')),
    lastError: kind === 'timeout' && data.details ? data.details : null,
    fatal: typeof data.fatal === 'boolean' ? data.fatal : null,
    sourceNumber,
    sourceUrl: safeUrl(source), requestUrl: safeUrl(requestUrl),
    labels: labels.map(safeMessage),
    detectedAt: new Date().toISOString(),
  };
}

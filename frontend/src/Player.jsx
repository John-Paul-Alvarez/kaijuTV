import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Play, Radio, RefreshCw, AlertCircle } from 'lucide-react';
import { describePlaybackError } from './playbackErrors';
import './playbackErrors.css';
import './relay.css';
import { createRelaySession, releaseRelaySession, relayLastError } from './relayClient';

function ErrorReport({ report, retry, useRelay, onUseRelay }) {
  if (!report) return null;
  return <div className="playback-error-report">
    <AlertCircle size={26} aria-hidden="true" />
    <h3>{report.title}</h3>
    <p>{report.explanation}</p>
    <dl className="error-facts">
      <div><dt>Error code</dt><dd><code>{report.code}</code></dd></div>
      <div><dt>HTTP status</dt><dd>{report.httpLabel}</dd></div>
      <div><dt>Failed at</dt><dd>{report.stage} · Source {report.sourceNumber}</dd></div>
      <div><dt>Playback route</dt><dd>{useRelay ? 'Backend relay' : 'Direct'}</dd></div>
    </dl>
    <p className="error-next-step">{report.nextStep}</p>
    <details className="error-technical">
      <summary>Technical details &amp; backend options</summary>
      <dl>
        <div><dt>Player message</dt><dd>{report.message}</dd></div>
        {report.playerCode && <div><dt>Player error code</dt><dd><code>{report.playerCode}</code></dd></div>}
        <div><dt>Error type</dt><dd>{report.type}</dd></div>
        {report.relayError && <><div><dt>Relay error</dt><dd><code>{report.relayError.code}</code> · {report.relayError.message}</dd></div><div><dt>Upstream HTTP status</dt><dd>{report.relayError.upstreamStatus || 'Not received'}</dd></div><div><dt>Relay failed at</dt><dd>{report.relayError.stage}</dd></div></>}
        {report.lastError && <div><dt>Last error before timeout</dt><dd><code>{report.lastError}</code></dd></div>}
        {report.fatal !== null && <div><dt>HLS event severity</dt><dd>{report.fatal ? 'Fatal' : 'Recoverable event; playback subsequently timed out'}</dd></div>}
        {report.requestUrl && <div><dt>Failed request URL</dt><dd><code>{report.requestUrl}</code></dd></div>}
        <div><dt>Selected stream URL</dt><dd><code>{report.sourceUrl}</code></dd></div>
        {report.labels.length > 0 && <div><dt>Directory labels (not a diagnosis)</dt><dd>{report.labels.join(', ')}</dd></div>}
        <div><dt>Detected at</dt><dd>{report.detectedAt}</dd></div>
        <div><dt>Could a backend help?</dt><dd>{report.backend}</dd></div>
      </dl>
      <p>URL query values are hidden. Browser-blocked responses may conceal their HTTP status; check DevTools for additional evidence.</p>
    </details>
    <button className="primary" onClick={retry}><RefreshCw size={15} /> Retry stream</button>
    {!useRelay && <button className="primary" onClick={() => onUseRelay(true)}>Try backend relay</button>}
  </div>;
}

export default function Player({ channel, streamIndex, onStatus, onErrorReport, useRelay = false, onUseRelay }) {
  const videoRef = useRef(null);
  const [state, setState] = useState('idle');
  const [retry, setRetry] = useState(0);
  const [errorReport, setErrorReport] = useState(null);
  const [connectingRelay, setConnectingRelay] = useState(false);
  const releasePending = useRef(Promise.resolve());
  const playAction = useRef(null);
  const source = channel?.streams[streamIndex]?.url;
  const sourceLabels = channel?.streams[streamIndex]?.labels;

  useEffect(() => {
    if (!source) return;
    const video = videoRef.current;
    let hls, cancelled = false, failed = false, timer, lastHlsError = null, sessionId = null;
    const controller = new AbortController();
    const update = value => { if (!cancelled) { setState(value); onStatus(value); } };
    const report = options => describePlaybackError({ ...options, source, sourceNumber: streamIndex + 1, labels: sourceLabels || [] });
    const fail = options => {
      if (cancelled || failed) return;
      failed = true;
      const details = report(options);
      setErrorReport(details);
      onErrorReport?.(details);
      clearTimeout(timer);
      hls?.stopLoad();
      video.pause();
      update('error');
      if (sessionId) relayLastError(sessionId, controller.signal).then(relayError => {
        if (!cancelled && relayError) {
          const enhanced = { ...details, relayError, playerCode: details.code,
            title: 'The backend relay could not retrieve this stream', code: relayError.code,
            explanation: relayError.message, stage: relayError.stage,
            nextStep: relayError.code === 'RELAY_BUDGET_EXCEEDED' ? 'The prototype relay limit was reached. Use direct playback where supported.' : 'Try another source or use Check stream for more evidence.' };
          setErrorReport(enhanced); onErrorReport?.(enhanced);
        }
      });
    };
    const armTimeout = () => { clearTimeout(timer); timer = setTimeout(() => fail({ kind: 'timeout', data: lastHlsError || {} }), 20000); };
    const play = () => {
      if (cancelled || failed) return;
      update('loading'); armTimeout();
      return video.play().catch(exception => {
        if (cancelled || failed || exception.name === 'AbortError') return;
        if (exception.name === 'NotAllowedError') {
          clearTimeout(timer); setErrorReport(report({ kind: 'play', exception })); update('ready');
        } else fail({ kind: 'play', exception });
      });
    };
    playAction.current = play;
    const playing = () => { if (cancelled || failed) return; clearTimeout(timer); lastHlsError = null; setErrorReport(null); update('playing'); };
    const waiting = () => { if (cancelled || failed) return; update('loading'); armTimeout(); };
    const paused = () => { if (!cancelled && !failed && video.readyState >= 2) { clearTimeout(timer); update('paused'); } };
    const nativeError = () => fail({ kind: 'native', mediaError: video.error });
    setErrorReport(null);
    onErrorReport?.(null);
    setConnectingRelay(useRelay);
    update('loading');
    video.addEventListener('playing', playing);
    video.addEventListener('waiting', waiting);
    video.addEventListener('pause', paused);
    video.addEventListener('error', nativeError);
    const start = async () => {
      let playbackSource = source;
      if (useRelay) {
        await releasePending.current;
        if (cancelled) return;
        const session = await createRelaySession(source, AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]));
        if (cancelled) { releaseRelaySession(session.id); return; }
        sessionId = session.id; playbackSource = session.manifestUrl;
      }
      if (cancelled) return;
      setConnectingRelay(false);
      armTimeout();
    if (video.canPlayType('application/vnd.apple.mpegurl') && (!useRelay || !Hls.isSupported())) {
      video.src = playbackSource;
      video.addEventListener('loadedmetadata', play);
    } else if (Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 20, lowLatencyMode: !useRelay });
      hls.on(Hls.Events.MANIFEST_PARSED, play);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (cancelled || failed) return;
        lastHlsError = data;
        if (data.fatal) fail({ kind: 'hls', data });
      });
      hls.loadSource(playbackSource);
      hls.attachMedia(video);
    } else fail({ kind: 'unsupported' });
    };
    start().catch(exception => {
      if (!cancelled) { setConnectingRelay(false); fail({ kind: 'relay', data: { details: exception.code || 'RELAY_SETUP_FAILED', reason: exception.message, type: 'Backend relay', response: { code: exception.status } } }); }
    });
    return () => {
      cancelled = true;
      controller.abort();
      if (sessionId) releasePending.current = releaseRelaySession(sessionId);
      playAction.current = null;
      clearTimeout(timer);
      hls?.destroy();
      video.removeEventListener('playing', playing);
      video.removeEventListener('waiting', waiting);
      video.removeEventListener('pause', paused);
      video.removeEventListener('error', nativeError);
      video.removeEventListener('loadedmetadata', play);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [source, streamIndex, sourceLabels, retry, onStatus, onErrorReport, useRelay]);

  return <div className={`screen ${channel ? 'has-channel' : ''}`}>
    <video ref={videoRef} controls muted playsInline aria-label={channel ? `${channel.name} live stream` : 'Live television player'} />
    {!channel && <div className="screen-intro">
      <div className="orbit orbit-one" /><div className="orbit orbit-two" />
      <div className="signal-emblem"><img src="/favicon.svg" alt="" /><span className="signal-dot" /></div>
      <span className="eyebrow">YOUR WORLD. ON AIR.</span>
      <h2>Small screen.<br /><em>Monster possibilities.</em></h2>
      <p>Pick a channel. Find your next obsession.</p>
      <span className="screen-hint"><Radio size={14} /> Live television from around the planet</span>
      <div className="skyline" aria-hidden="true">{Array.from({ length: 25 }, (_, i) => <i key={i} style={{ height: `${25 + (i * 37 % 85)}px` }} />)}</div>
    </div>}
    {channel && ['loading', 'error', 'ready'].includes(state) && <div className={`player-overlay ${state}`} role={state === 'error' ? 'alert' : 'status'}>
      {state === 'loading' ? <><RefreshCw className="spin" size={28} /><h3>{connectingRelay ? 'Connecting to backend relay…' : 'Tuning in…'}</h3><p>{channel.name}</p>{connectingRelay && <p>A sleeping backend may take a minute to wake up.</p>}</> : state === 'error' ? <ErrorReport report={errorReport} retry={() => setRetry(value => value + 1)} useRelay={useRelay} onUseRelay={onUseRelay} /> : <><h3>Ready when you are.</h3><p>{errorReport?.explanation || 'Press Play channel to start playback.'}</p><button className="primary" onClick={() => playAction.current?.()}><Play size={16} /> Play channel</button></>}
    </div>}
    {!channel && <span className="screen-corner">KAIJU SIGNAL / 001</span>}
  </div>;
}

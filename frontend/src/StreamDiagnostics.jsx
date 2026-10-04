import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import './streamDiagnostics.css';

const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export default function StreamDiagnostics({ channel, streamIndex, browserError }) {
  const source = channel?.streams[streamIndex]?.url;
  const controller = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  useEffect(() => {
    setBusy(false); setError(''); setReport(null);
    return () => controller.current?.abort();
  }, [source, channel?.key, streamIndex]);
  if (!source) return null;
  async function check() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true); setError(''); setReport(null);
    const deadline = setTimeout(() => current.abort('deadline'), 90000);
    try {
      const response = await fetch(`${base}/api/diagnostics`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: current.signal,
        body: JSON.stringify({ url: source, channelName: channel.name, sourceNumber: streamIndex + 1, browserError: browserError?.code || null }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ? `${data.code || 'BACKEND_ERROR'}${data.reasonCode ? ` (${data.reasonCode})` : ''}: ${data.message}` : `Backend returned HTTP ${response.status}.`);
      if (!data?.checks || !Array.isArray(data.checks)) throw new Error('The backend returned an unexpected response.');
      if (!current.signal.aborted) setReport(data);
    } catch (exception) {
      if (!current.signal.aborted || current.signal.reason === 'deadline') {
        setError(current.signal.reason === 'deadline' ? 'The backend did not respond within 90 seconds. Check that it is running and reachable.' : exception.message?.startsWith('Backend') || !['TypeError', 'AbortError'].includes(exception.name)
          ? exception.message : 'Could not reach the diagnostics backend. Start backend on port 4000, or check its configured address.');
      }
    } finally {
      clearTimeout(deadline);
      if (controller.current === current) setBusy(false);
    }
  }
  function download() {
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = objectUrl; link.download = `kaijutv-stream-check-${report.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  return <section className="stream-diagnostics" aria-label="Stream diagnostics">
    <div className="diagnostics-heading"><div><strong>Check this stream</strong><p>Find out what the server can retrieve from Source {streamIndex + 1}.</p></div>
      <button onClick={check} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''} />{busy ? 'Checking…' : 'Check stream'}</button></div>
    {busy && <p role="status">Checking playlists and a small video sample. A sleeping backend may take a minute to wake up.</p>}
    {error && <p role="alert" className="diagnostics-error">{error}</p>}
    {report && <div className="diagnostics-result" role="status">
      <p><code>{report.code}</code>{report.cached && <small> · cached check</small>}</p><p>{report.summary}</p>
      <div className="diagnostics-table"><table><thead><tr><th>Check</th><th>HTTP</th><th>Response</th></tr></thead><tbody>{report.checks.map((item, i) => <tr key={i}><td>{item.stage}</td><td>{item.status ?? 'Not received'}</td><td>{item.errorCode || item.contentType || 'No content type'}{item.bytes > 0 && <small> · {item.bytes.toLocaleString()} bytes sampled</small>}</td></tr>)}</tbody></table></div>
      <details><summary>Request details</summary>{report.checks.map((item, i) => <div key={i}><p><strong>{item.stage}</strong><br /><code>{item.url}</code></p>{item.message && <p>{item.message}</p>}{item.redirects?.map((redirect, j) => <p key={j}>Redirect {redirect.status}: <code>{redirect.to}</code></p>)}</div>)}</details>
      <ul>{report.limitations.map(text => <li key={text}>{text}</li>)}</ul>
      <button onClick={download}><Download size={15} /> Save report</button>
    </div>}
  </section>;
}

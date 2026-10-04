# Backend prototype plan

## Phase 1 — implemented

Organize the app into `frontend/` and `backend/`, using the same JavaScript/Node.js/Express approach as Shop Manager. Add an on-demand stream diagnostic API and frontend report panel. Preserve existing browsing, favorites, source selection, and direct playback. Keep the previous animation audit in this handoff's `outputs/animation-audit/` folder.

Measure upstream HTTP responses, redirects, HLS validity, and sample accessibility. Keep report downloads, bounded requests, a small cache, and temporary history. No login, MongoDB, FFmpeg, or continuous video relay is needed for this phase.

## Phase 2 — collect real comparison evidence

Run the same Source 1 URLs in KaijuTV, a conventional browser, VLC, and the diagnostic backend. Start with ANIME x HIDIVE and other jmp2.uk sources, EnerGeek/EnerGeek Fan, and a source known to start playback. Record hostname, exact source, browser error, upstream status, failing stage, and time. Server location may produce different results from a user's computer.

Do not equate MEDIA_ERR_4 with a codec problem. Use HTTP failures and playlist inspection to establish the next action. Download diagnostic reports because free hosting restarts discard memory.

## Phase 3 — implement fixes supported by evidence

| Evidence | Candidate next step |
| --- | --- |
| Backend obtains valid accessible media, browser access is confirmed blocked | Evaluate a small authorized HLS relay, with rewritten child playlists/segments and bandwidth measurement |
| Upstream returns 404, invalid playlist, or an unavailable source | Prefer a working alternate source; improve directory availability tracking |
| Access requires authentication, regional entitlement, or a license | Use an available authorized source or official player |
| Media is reachable but a specific incompatible codec is confirmed | Investigate an alternative source or external conversion hosting; do not assume Render Free can continuously transcode |
| Both browser and backend time out | Investigate upstream reachability and server location before adding a relay |

## Phase 4 — optional later features

Add source fallback, limited availability checks, and saved diagnostics backed by a database only when needed. Schedule/background scans and continuous media delivery require separate resource and hosting decisions. The first 50-feed browser audit was a startup sample, not proof that all animation sources fail the same way.

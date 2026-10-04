# HLS relay prototype

The relay addresses browser CORS failures such as the `jmp2.uk` HTTP 302 responses without Access-Control-Allow-Origin. Node follows the redirects and the browser fetches rewritten playlists and media through KaijuTV's backend.

## Use it

Start backend and frontend as before. Select a channel. Sources on `jmp2.uk` now select **Backend relay** automatically. Use the **Playback route** dropdown beside the source selector to switch between Direct playback and Backend relay. Other sources stay direct unless you change that setting. A direct playback error also offers **Try backend relay**.

The backend must be running. A sleeping hosted backend can take a minute to wake; session setup allows 90 seconds. The existing 20-second playback deadline starts after relay setup. The relay uses hls.js where available, falling back to native HLS when needed. No video conversion is performed.

## What is forwarded

- Redirected entry playlists and child/variant playlists, with relative references resolved against the final upstream URL.
- Audio/subtitle playlists, initialization files, normal segments, and HTTP/HTTPS key files already referenced in a source playlist.
- Single forward byte-range requests for segmented MP4. Multipart and suffix ranges are unsupported; upstream must honor the requested range.
- Root-relative relay links that resolve on the playlist's serving origin, including separate HTTPS backend hosting.

Source sessions accept only current IPTV-org entries without special user-agent/referrer requirements. Every outbound request validates public DNS and pins the connection, including after redirects. Resource URLs are registered from a playlist; callers cannot provide an arbitrary upstream URL to the resource route. No cookies, login credentials, regional overrides, or license-acquisition system were added.

Playlist URL variables and non-HTTP URI schemes are unsupported. Low-latency partial-segment/blocking-reload hints are removed so the prototype uses complete segments; streams with no complete segments may still fail. Media encoding and browser compatibility remain unchanged.

## Prototype limits

| Limit | Value |
| --- | --- |
| Simultaneous sessions | 2 |
| Simultaneous upstream resource requests | 8 |
| Session starts per client | 10 per minute |
| Idle expiry | 5 minutes |
| Maximum session lifetime | 2 hours |
| Payload budget per session | 128 MiB |
| Total relay payload budget per backend process | 256 MiB |
| Playlist response limit | 1 MiB |
| Media response limit | 16 MiB |
| Upstream resource timeout | 30 seconds |

Payload limits are approximate bandwidth controls and exclude HTTP overhead and diagnostic/directory traffic. Budgets and sessions reset on a backend restart. These are demo limits, not persistent monthly usage accounting. A high-bitrate channel can reach its budget within a few minutes. The UI reports RELAY_BUDGET_EXCEEDED rather than continuing indefinitely.

Continuous relaying sends video through the backend and consumes hosting bandwidth. Render Free sleeps after inactivity and imposes resource/usage limits; it is suitable for a limited experiment, not a promise of unrestricted TV delivery. Review [Render's current free-service limits](https://render.com/docs/free) before deployment. No service was deployed by this update.

## API

- `POST /api/relay/sessions` with `{ "url": "<current-directory-source>" }` returns an opaque session ID and manifest path.
- `GET /api/relay/sessions/:id/resources/:resource` returns a rewritten playlist or streams a registered media resource.
- `GET /api/relay/sessions/:id` reports served bytes and the latest sanitized relay error, including actual upstream HTTP status when available.
- `DELETE /api/relay/sessions/:id` closes the session and aborts its active upstream requests. The player calls this when switching route/channel/source or retrying.
- `/api/health` includes relay session, request, and payload-budget counters.

For separately hosted frontends, configure FRONTEND_ORIGINS and VITE_API_BASE_URL as documented previously. CORS configuration now permits Range and DELETE, and exposes Content-Range and Accept-Ranges response headers. No dependency changes are needed.

# KaijuTV

A React live-TV prototype with a small JavaScript/Node.js/Express backend for investigating failed streams. No accounts or database are required.

```text
kaijuTV/
  frontend/          React, Vite, player, directory, diagnostics UI
  backend/           Express API, bounded stream checks, temporary report history
  docs/              implementation plan, deployment guide, validation notes
  package.json       convenient scripts for both folders
  render.yaml        optional Render Free backend configuration
```

## Run locally

Use Node.js 22.12 or newer. Open two PowerShell terminals in the project root.

Backend:

```powershell
cd backend
npm.cmd ci
npm.cmd run dev
```

Frontend:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Open http://127.0.0.1:5173/. Select a channel and click **Check stream** below the player. Vite forwards `/api` requests to port 4000. Health: http://127.0.0.1:4000/api/health.

Optional environment files: copy each folder's `.env.example` to `.env` and edit the values. Defaults work locally. Restart after changing backend settings.

From the root, `npm.cmd run dev:backend` and `npm.cmd run dev:frontend` are equivalent conveniences; they still run in separate terminals. `npm.cmd run build` builds the frontend. `npm.cmd test` runs both test suites. Install dependencies inside the two folders, not the root.

## What the prototype checks

- The selected URL must appear in the current IPTV-org streams directory and not require special referrer/user-agent headers.
- Fetches the entry HLS playlist, follows the first variant, and checks a media playlist. At most three playlist responses are checked.
- Fetches at most 64 KiB each from the first media segment and optional initialization segment. This is a network sample, not video decoding.
- Records HTTP status, content type, redirects, CORS response header, playlist type, sampled byte count, and specific failure codes.
- Displays the result below the player and offers **Save report** as JSON. Also exposes the latest 100 reports through `/api/diagnostics/recent`.

A successful check means the backend retrieved a playlist and sample; it does not establish browser playback, correct codecs, continuous availability, or access rights. Encrypted streams are flagged; keys/licenses are not fetched. The frontend loads its directory directly from IPTV-org and offers direct playback or the scoped backend HLS relay.

History and cached checks are temporary memory. They reset on a restart; download reports you want to keep. Source URL query values are hidden in returned reports. Browser error codes are attached as context, not treated as server diagnoses.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness and directory-cache status |
| POST | `/api/diagnostics` | Check a selected public directory source |
| GET | `/api/diagnostics/recent` | Latest 100 reports, temporary and shared |

POST body:

```json
{
  "url": "https://broadcaster.example/live.m3u8",
  "channelName": "Example channel",
  "sourceNumber": 1,
  "browserError": "MEDIA_ERR_4"
}
```

The example hostname is illustrative; only URLs actually in the current directory are accepted. A completed check returns HTTP 200 even when the upstream stream fails: inspect `outcome`, `code`, and `checks[].status`. Input rejection, rate limit, directory outages, and busy service return appropriate non-200 API responses.

The service permits two simultaneous checks and ten POST attempts per client per minute. Results are cached for 60 seconds; the directory for one hour. The upstream check budget is 20 seconds, in addition to a possible 15-second directory refresh. Requests use standard ports, DNS validation, pinned public addresses, bounded redirects, and response limits. The scoped HLS relay is described in [RELAY.md](docs/RELAY.md). There is no arbitrary URL proxy or FFmpeg process.

See [the implementation plan](docs/PLAN.md), [Render deployment instructions](docs/DEPLOYMENT.md), and [validation](docs/VALIDATION.md).

## Relay playback

Sources on jmp2.uk now use Backend relay by default. Switch the Playback route selector to choose direct playback or relaying. See [relay behavior and demo limits](docs/RELAY.md).

"# kaijuTV" 

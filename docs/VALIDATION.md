# Validation — October 1, 2026

## Passed

- Backend: 14 Node tests covering HTTP API responses, CORS, catalog validation, short-lived caching, history redaction, rate limits, concurrency recovery, DNS/address policy, relative HLS references, bounded sample options, HTTP failures, invalid/empty/oversized responses, timeouts, and encryption tags.
- Frontend: 10 playback-error tests, including a regression check that MEDIA_ERR_4 does not claim a confirmed decoding failure.
- Frontend production build. The restricted Windows environment required Vite's `--configLoader runner` option to load configuration. Vite reported a bundle-size warning; build output was produced successfully. Development dependency optimization encountered filesystem access restrictions in this session, so browser verification used the production preview.
- Migration script: dry-run makes no changes; newer original edits are rejected; organized folders and frontend dependency relocation are correct; all archived original source hashes match. Tested against a disposable project copy with `-SkipInstall`. The user's original Downloads project was not changed.
- Browser UI: selected ANIME x HIDIVE, verified corrected native error stage, and clicked Check stream. The production backend's network restriction was shown as DIRECTORY_UNAVAILABLE (EACCES), rather than being reported as a TV stream failure.
- Controlled upstream fixture: real Express API and diagnostic logic fed synthetic HLS/media responses to the frontend. Verified the HTTP 200/206 report table and downloaded JSON export. The download-event API timed out, but the generated file was independently found and read from Downloads.

## Not yet established

The execution environment denied Node's outbound connection to IPTV-org with EACCES. The production backend therefore could not load its source allowlist and did not diagnose any real TV upstream in this session. This restriction is distinct from the existing browser MEDIA_ERR_4 error. Run the real checks on the user's machine or a deployed service with network access.

Render deployment, conventional Chrome/VLC comparisons, codec decoding, long-duration playback, and actual relay behavior were not tested. No backend was deployed, no live video relay was created, and no FFmpeg conversion was added.

## Evidence

- `hidive-backend-check.json`: observed production API rejection from the restricted environment.
- `backend-network-restriction.png`: actual browser panel displaying that rejection.
- `diagnostics-fixture-preview.png`: report UI with explicitly synthetic upstream results.
- `fixture-export.json`: JSON downloaded by the UI from the controlled fixture; not a diagnosis of ANIME x HIDIVE.

Temporary servers and test fixtures live outside the delivered source tree. The shipped backend uses the real public directory and stream requests, with no fixture switch.

# KTV-01 — Viewing layout review

Status: implementation prepared in an isolated working copy. Not Done: application to the original project and interactive visual/playback checks are still pending.

## Implemented scope

- Replaced the large hero and separate directory with a viewing-first desktop layout: app bar, functional Live TV / Favorites navigation, prominent player, and channel browser.
- Retained the existing channel cards, search, categories, country filter, favorites storage, source and route selection, diagnostics, and report download.
- Added responsive stacking: player above channel browsing on narrow screens, wrapped controls, and constrained grid columns.
- Made idle, directory-loading, and directory-failure states explicit.
- Added a shared presentation of playback events. Live / Watching appears only for the existing player's playing status; Connecting, Paused, Ready to play, and errors remain distinct.
- Changed only the player's idle copy. Its source-loading, HLS/native/relay selection, playback-event handlers, retries, and cleanup logic are unchanged.
- Kept compact channel rows, new IndexedDB features, recent history, Settings, TV surfing controls, and fuller filter UX in their later stories.

## Changed files

- frontend/src/main.jsx
- frontend/src/styles.css
- frontend/src/Player.jsx (idle text only)
- frontend/src/playbackPresentation.js
- frontend/tests/playbackPresentation.test.js

No package, lockfile, backend, or deployment changes.

## Validation actually completed

- Frontend tests: 17 passed (14 existing tests plus 3 playback-presentation tests).
- Standard production command: npm.cmd run build — passed.
- Build also passed with Vite's config runner.
- Existing Vite large-bundle advisory remains; no extra dependency was added.
- Compared the complete Player source before its render return against the original: identical.
- The local review fixture and its app modules compile offline through Vite.

## Verification still open

| Acceptance | Implementation | Verification needed |
| --- | --- | --- |
| Player and channels take priority in the approved design | Prepared | Desktop visual review |
| Selecting a channel starts existing playback | Wiring and player logic preserved | Interactive media playback and a known working source |
| Idle/loading/directory-failure states | Prepared | Browser walkthrough |
| Favorites, sources, routes, diagnostics remain accessible | Prepared | Keyboard and interaction walkthrough |
| Player above browser, no horizontal overflow on narrow screens | CSS prepared | 320px / 390px viewport inspection and real-device checks as applicable |
| Watching only after playback starts | Unit checks passed | Real playing / paused / failed event walkthrough |

The original Downloads project is outside this session's writable roots. A request for access returned no granted permission. Computer Use returned “Computer Use was not approved to use Firefox.” A Node request to the local preview also failed with EACCES. These environment restrictions prevented applying the change and completing browser verification; the story must remain open until those steps are completed.

## Local review

From the isolated working copy, a normal npm.cmd run dev uses the real IPTV-org directory. It requires working network access and the existing backend for relay/diagnostic features.

A separate fixture-server.mjs in the KTV-01 working directory can be started with Node and opened at http://127.0.0.1:5181/__ktv01/. Its directory and media are synthetic. It generates WebM and emulates native HLS capability so the unchanged player can receive actual browser media events. It does not prove HLS compatibility, public stream availability, or backend relay reachability. The fixture compiled, but was not run through a browser in this session. It is not included in the production patch.

## Manual review checklist

- [ ] Open the app at a desktop width and confirm the player is the primary area.
- [ ] Use Tab / Enter and Skip to player to navigate the interface.
- [ ] Select a working source; confirm Connecting changes to Live only when video plays.
- [ ] Pause it; confirm Live / Watching clears.
- [ ] Test a failing source and retry; confirm it never claims Watching.
- [ ] Save a favorite, open Favorites, and confirm it is available.
- [ ] Switch available sources and playback routes.
- [ ] Open Check stream and confirm diagnostics/report download are accessible.
- [ ] Test directory-loading and directory-failure/retry states.
- [ ] Inspect narrow viewports (320px and 390px): player first, usable controls and channel cards, no horizontal page overflow.
- [ ] Review the result before selecting KTV-02.


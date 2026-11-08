# KTV-02 — Browse channels while watching

Status: prepared for application and review. The working copy passes automated checks; the original project has not been changed by this story.

## Viewer outcome

As a viewer, I want to scroll a compact channel list beside the video, so that I can explore without losing what I am watching.

## Implemented

- Replaced the channel-card grid with compact rows showing logo/fallback, full accessible channel name, country, category or playback status, and separate watch/favorite buttons.
- Kept search and filters outside the scrolling results on desktop. Narrow layouts retain one-column rows below the player.
- Removed the automatic scroll-to-player action on channel selection.
- Capture and restore the results pane's scroll position around a channel change. Compensate for player controls changing the directory's page position in stacked layouts.
- Keep a single memoized playback surface with stable callbacks. Scrolling has no playback state updates; favorites and existing directory controls do not select a new source.
- Kept the existing player's source-change and cleanup lifecycle unchanged.
- Preserve long names through readable wrapping plus full native title/accessibility text. Missing or failed image URLs use a TV icon.
- Display Watching only for the selected channel after the player's playing status. Connecting, Paused, Ready to play, and failure states remain distinct.

## Files

Changed:
- frontend/src/main.jsx
- frontend/src/styles.css

Added:
- frontend/src/ChannelList.jsx
- frontend/src/browserPosition.js
- frontend/tests/channelList.test.js
- frontend/tests/browserPosition.test.js

The Player module, diagnostics, catalogue, relay client, package/lockfile, backend, and deployment settings are unchanged.

## Validation completed

- npm.cmd test: 27 tests passed.
- New checks: 5 server-rendered component tests and 5 scroll-position unit tests.
- Component checks cover independent watch/favorite controls, logo fallback markup, accessible long names, escaping, favorite/selection independence, and selected versus actually playing states.
- Position checks cover desktop scroll restoration, downward/upward layout shifts, zero scroll positions, and missing/unchanged geometry.
- npm.cmd run build: passed using the standard command.
- The existing large-bundle advisory remains.
- Verified unchanged files against the original checkout hashes.

These are code/component checks, not an interactive browser or media playback test.

## Acceptance evidence

| Criterion | Current evidence | Still to verify |
| --- | --- | --- |
| Compact identity/country/state rows and logo fallback | Component checks pass; CSS prepared | Desktop/mobile visual check and image-load-error behaviour |
| Browsing keeps the active stream | Stable player props, no scroll-driven playback updates, unchanged Player module | Play media while scrolling and using favorites/search |
| Switching uses the existing player | One playback surface in the app; unchanged source cleanup | Rapid switches and confirmation of one active media/relay session |
| Browser position survives selection | Scroll calculation tests pass; selection no longer scrolls to the player | Actual browser scrolling in desktop and stacked layouts |
| Long names and failed selections remain usable | Rendered content/status tests pass | Narrow-screen inspection |
| Mouse, touch, keyboard selection | Separate native buttons with focus styles and touch sizing | Interactive and real-device checks |

## Environment limitations

The original Downloads repository remains outside this session's writable roots. A permission request returned no granted write access. Previous browser access was rejected, so interactive browser verification remains unavailable; it was not retried through another browser.

Apply this story with Apply-KaijuTV-KTV02.ps1. It checks the current KTV-01 baseline and the unchanged playback/dependency files, backs up edited files, and refuses newer edits.

## Review walkthrough

1. Apply the update and open the normal frontend.
2. Start a known working channel; confirm it reaches Live.
3. Scroll far down the channel list. Confirm the video keeps playing and the search/filter controls remain visible on desktop.
4. Select another row. Confirm the same video element changes source and the browser stays at its previous position.
5. Tap a favorite heart. Confirm it changes favorites without switching or restarting playback.
6. Choose the already selected channel. Confirm it does not reconnect.
7. Check a long channel name and missing/broken logo.
8. Try a failing source. Confirm the row stays selected but does not show Watching.
9. Use Tab then Enter/Space to select channels and toggle favorites.
10. Repeat at 320px / 390px and on touch devices when available.
11. Review before selecting KTV-03.

A separate local fixture may be used to isolate UI behaviour from stream outages. It uses a synthetic directory and generated WebM with native HLS capability emulated. It does not verify public HLS decoding, upstream TV availability, or the production backend.

KTV-03 has not been started. No commit, push, or production deployment was performed for this story.


# KTV-03 — Search and filter while watching

Status: implementation prepared in a working copy; application and interactive acceptance review remain open.

## User story

As a viewer, I want channel search and country/category filters, so that I can find relevant channels while I watch.

## Implemented behaviour

- Search, category, and country restrictions combine with AND logic.
- Search is case-insensitive, trims surrounding whitespace for matching, and supports channel names, country names, and country codes.
- Applied restrictions appear as named, individually removable chips.
- Clear filters resets search/category/country together while retaining the current Live TV or Favorites collection.
- Empty matching results offer a filter reset. An actually empty Favorites collection instead explains saving channels and offers Browse all channels.
- A concise result summary announces updated counts and distinguishes directory loading/failure from zero matches.
- New filter results start at the top of the results pane.
- Selecting a result preserves all filters and uses KTV-02's scroll-position handling.
- Filtering can exclude the playing channel from results without clearing the selected channel.
- Filter state is held separately from selected channel, source, route, and playback status.
- Short desktop windows allow page scrolling rather than squeezing rows out of view beneath active filters.

## Scope and files

Changed:
- frontend/src/main.jsx
- frontend/src/styles.css
- frontend/tests/channelList.test.js (disable the test compiler's WebSocket listener)

Added:
- frontend/src/ChannelBrowserControls.jsx
- frontend/src/directoryFilters.js
- frontend/tests/channelBrowserControls.test.js
- frontend/tests/directoryFilters.test.js

The Player, channel rows, scroll helper, diagnostics, relay client, catalogue loader, dependencies, backend, and deployment configuration are unchanged.

## Checks completed

- All 43 frontend tests pass: 27 existing plus 16 new filter/control checks.
- The standard npm.cmd run build command passes.
- The usual large-bundle advisory remains.
- Tests cover combined restrictions, country searches, whitespace/case handling, matching order/reference preservation, clearing one restriction, and staying in Favorites after reset.
- Component checks cover named removal controls, count announcements, independent action wiring, useful empty states, loading/errors, and escaped long queries.
- Removed the test-only WebSocket port conflict; the final test run completes without that warning.
- The channel-selection callback and memoized playback-surface props are unchanged; unchanged modules are checked against baseline hashes.

The component tests render markup and invoke pure control callbacks. They do not simulate real keyboard/touch input, browser layout, decoding, or sustained video playback.

## Acceptance and remaining verification

| Criterion | Automated/code evidence | Remaining review |
| --- | --- | --- |
| Search/category/country combine correctly | Filter tests and control wiring pass | Browser interaction |
| Active filters are visible and clearable | Chip markup and callbacks pass | Visual/touch/keyboard inspection |
| Current stream survives filtering that excludes it | Filter actions change browsing state only; player wiring unchanged | Actual playing stream while filtering |
| Empty results have a reset | Normal and Favorites cases pass | Browser recovery walkthrough |
| Selection preserves search and filters | Selection callback unchanged; no filter action in it | Select a filtered result in the browser |

## Review walkthrough

1. Apply this story and open the normal frontend.
2. Play a known working source and wait for Live.
3. Search for another channel, choose a category, and choose a country. Confirm all restrictions apply and the playing channel continues even when absent from the list.
4. Remove one chip. Confirm other restrictions stay selected.
5. Use a query that returns no results, then Clear filters.
6. Save at least two favorites, open Favorites, and repeat a no-match search. Clear filters must stay in Favorites.
7. Select a filtered result. Confirm search/category/country remain and the existing player switches channel.
8. Check counts, loading/error copy, keyboard focus, and narrow widths with long filter values.
9. Review before selecting another story.

## Delivery constraints

The original Downloads project remains outside this session's writable roots; a write-access request returned no granted access. Apply using Apply-KaijuTV-KTV03.ps1, which backs up changed files and refuses unexpected edits or a changed playback/dependency baseline.

Interactive browser permission was unavailable in prior work, so real-browser/media and mobile acceptance remain open. They are not claimed as verified here. No commit, push, or deployment was performed for KTV-03.


# RetroOasis — UI / UX notes

## Homepage / library landing

- **Empty library:** onboarding hero, supported-platforms strip, prominent drop zone, and cloud-saves quick action stay visible (browse chrome / side rails are hidden, not the whole `#library-section`). Premium keeps soft chrome; Arcade keeps the loud sticker drop-zone treatment.
- **Returning users:** dynamic headline (`Welcome back` within 7 days of last play) and a **Continue playing** hero for the most recent title.
- **Jump Back In row:** horizontal strip for additional recent games; skips the hero title to avoid duplication.
- **Recently Added row:** games imported in the last 14 days (when not using grouped layout).
- **Overview cards:** Favorites, missing cover art, and recent-play stats are clickable shortcuts.
- **Empty sidebar:** shows an import hint instead of disappearing entirely.

## Overlays and focus

- **`overlayStack.ts`** registers modals, settings, system picker, and Play Together so Escape dismisses the topmost surface in order.
- Library search (`Ctrl+K` / `/`) is suppressed while any overlay is active.

## Library rendering

- Typing in search dims the grid (`library-grid--busy`) until the debounced re-render completes.
- Identical filter/sort/layout signatures skip rebuilding the grid DOM (overview, hero, and highlights still refresh).
- Toolbar **Reset** appears when search, system, or favorites filters are active.
- **Grid / list / compact** layout toggles in the toolbar (persisted per profile via display prefs).
- When **profile library filter** is on, a chip beside the game count shows the active profile; empty filtered views explain how to import or disable the filter.

## Launch flow

- **Single launch path:** `launchGameFromLibrary()` resolves library blobs (including cloud Pull & Play) before calling `onLaunchGame` in `main.ts`.
- **Double-tap guard:** `launchState.ts` sets `html.launch-in-progress` while a launch is active; duplicate play taps show “Already starting a game…”.
- **Loading overlay phases:** Save sync, core download, and emulator boot update `#loading-message` / `#loading-subtitle`. Experimental system notices append to the subtitle instead of replacing sync text.
- **Stacked toasts:** Launch-time notices (compatibility, save sync, BIOS hints) use `showInfoToast(msg, type, { queue: true })` so multiple messages stay visible.

## Tooling

| Command | Purpose |
|---|---|
| `npm test src/ui/launchGame.test.ts` | Library launch helper |
| `npm test src/ui/toasts.test.ts` | Toast stack behavior |

## Follow-ups

- Incremental library DOM updates (`UIDirtyTracker`)
- Settings gamepad/couch navigation
- High-contrast theme toggle

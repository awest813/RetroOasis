# RetroOasis — UI / UX notes

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

- Unified overlay stack (Escape + focus for all modals)
- Incremental library DOM updates (`UIDirtyTracker`)
- Settings gamepad/couch navigation
- High-contrast theme toggle

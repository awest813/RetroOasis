# RetroOasis — Support Runbook

This runbook maps the most common user-facing problems to root causes and actionable fixes. Share this with anyone triaging GitHub Issues.

---

## How to read this document

Each section follows the pattern:
- **Symptom** — what the user reports
- **Root cause(s)** — why it happens
- **Fix / workaround** — what to tell the user or what to change in code

---

## 1. "Game won't load" / stuck on loading screen

**Root causes**
1. Invalid or corrupted ROM file.
2. Unsupported archive format (e.g. bzip2, xz, Deflate64 inside ZIP).
3. BIOS missing for a system that requires it (PS1, PSP, NDS, GBA-BIOS-requiring games).
4. WASM compilation failed or cached module is incompatible after an update.
5. Browser lacks SharedArrayBuffer support (required for PSP / N64 cores).

**Fix**
- Ask the user to open DevTools → Console and share any red errors.
- BIOS missing: Settings → BIOS → upload the required file.
- If the ROM is a ZIP, ask the user to try unzipping it manually and dropping the inner file.
- WASM stale cache: user can clear site data in browser settings, then reload.
- SharedArrayBuffer: confirm the page is served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers (or the service worker is active — check DevTools → Application → Service Workers).

---

## 2. "My save is gone"

**Root causes**
1. User cleared browser storage / cookies / site data.
2. User switched browsers or devices (saves are per-browser-profile).
3. Private/incognito browsing — IndexedDB is wiped on tab close.
4. iOS "Clear History and Website Data" — erases ALL origin storage.
5. Auto-save failed silently during a crash or tab kill.
6. Cloud sync conflict resolved in favour of the older remote copy.

**Fix**
- Saves are in IndexedDB (`retro-oasis-saves`); they cannot be recovered once cleared.
- Prevention: encourage users to connect cloud saves (Settings → Cloud Saves) before relying on the browser.
- If cloud sync is connected, the latest cloud copy can be pulled back via Settings → Cloud Saves → Sync.
- For future save exports: track issue #X requesting downloadable save-state export.

---

## 3. "Game is slow / choppy"

**Root causes**
1. Device does not meet minimum performance requirements for the core (PSP / N64 are heavy).
2. High-resolution or post-processing mode enabled on a mid-range device.
3. Browser tab competing with background tasks.
4. WebGPU post-processing enabled on a device/browser that doesn't support it well.

**Fix**
- Settings → Performance → switch to **Performance** or **Low Power** mode.
- Settings → Performance → disable WebGPU post-processing (set Effect to None).
- Ask the user to close other tabs and background apps.
- For mobile, confirm they are not in Low Power Mode (iOS) which throttles the GPU.

---

## 4. "Sound is missing or broken"

**Root causes**
1. Browser tab muted (speaker icon in tab bar).
2. Volume slider in Settings set to zero.
3. Some games take several seconds before audio initialises.
4. Web Audio API suspended due to user-gesture policy (requires a click before audio plays).

**Fix**
- Check the browser tab's audio icon.
- Click the game canvas once to ensure it has focus, then try pressing a button to start the game.
- Check Settings → volume slider.

---

## 5. "Controls not responding"

**Root causes**
1. Game canvas does not have keyboard focus.
2. Gamepad connected after game was already launched (hot-plug timing).
3. Virtual touch controls disabled on a touch device.

**Fix**
- Click directly on the game screen and try again.
- For gamepads: press any button on the controller to activate it, then reload the game.
- Touch controls: Settings → Controls → enable "Touch controls on touch devices".

---

## 6. "Can't connect to a friend online (Play Together)"

**Root causes**
1. Both players not using the same signaling server URL.
2. Strict NAT / corporate firewall blocks WebRTC or WebSocket.
3. Different game ROMs (different checksums → different lobby rooms).
4. Wrong invite code (typo, or code expired because host left the room).
5. Signaling server is down or slow.

**Fix**
- Confirm Settings → Play Together → Server URL is identical on both ends.
- Both players must have the same ROM file to match the same lobby.
- Ask both players to open the "📋 Logs" panel and share the diagnostic output.
- If NAT is the issue: add a TURN server URL under Settings → Play Together → Advanced → ICE Servers.
- If the server is down: check the server operator's status page or try the default community relay.

---

## 7. "Cloud sync isn't working / saves not syncing"

**Root causes**
1. OAuth access token expired (Google Drive and Dropbox implicit-grant tokens expire within 1 hour).
2. Cloud provider rate-limit or API outage.
3. Wrong folder/path configured for WebDAV or pCloud.
4. MEGA login credentials changed since last connection.

**Fix**
- Re-connect the cloud provider (Settings → Cloud Saves → Disconnect, then reconnect).
- Check the browser console for HTTP 401 / 403 errors — these indicate token expiry or bad credentials.
- For WebDAV: confirm the URL is correct and accessible from the browser (try opening it in a new tab).

---

## 8. "App installed as PWA but won't update"

**Root causes**
1. Service worker cached the old version and hasn't received the update yet.
2. `index.html` is cached by the CDN with a long max-age.

**Fix**
- In the browser: Settings → Apps → (find RetroOasis) → Clear storage, then reopen.
- Alternatively: DevTools → Application → Service Workers → click "Update", then reload.
- On the deployment side: ensure `index.html` is served with `Cache-Control: no-cache`.

---

## 9. "Cover art is not loading"

**Root causes**
1. GitHub API rate limit hit (60 unauthenticated requests/hour per IP).
2. The game name doesn't match any entry in the cover art database.
3. Network error or CORS block.

**Fix**
- Wait 1 hour for the GitHub rate limit to reset, or add a GitHub personal access token in Settings → API Keys.
- Try the manual cover art search (game card → Edit → Cover Art → Search or paste URL).
- If CORS is the problem, it will show as a network error in the console — this typically means the CDN changed its headers.

---

## 10. Escalation checklist

When a user reports a bug you can't reproduce:

1. Ask for: browser + version, OS, device model (mobile vs desktop).
2. Ask for: DevTools → Console screenshot (any red errors?).
3. Ask for: DevTools → Application → Storage → rough IndexedDB size.
4. Ask for: exact steps to reproduce from a fresh page load.
5. Search existing GitHub Issues before creating a new one.
6. If data loss occurred, note that recovery is not possible from our end — all data is local.

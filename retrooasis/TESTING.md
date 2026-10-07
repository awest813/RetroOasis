# Regression checks

Run these commands from the repository root:

| Command | Coverage |
| --- | --- |
| `npm test` | Core options, archives, uploads, disc sets, routing, metadata edits, controller snapshots, covers, LAN rooms/host/service and development file serving |
| `node scripts/test-core-options.mjs --browser` | Core-option selection, focus, Escape and external setting updates |
| `node retrooasis/scripts/test-gamepad.mjs --browser` | Controller focus, activation, release guards, background recovery, row navigation and cleanup |
| `node retrooasis/scripts/test-gamepad.mjs --settings` | After building, serves the real Settings app at `/settings#/settings` with a simulated-controller toolbar for access errors, custom/standard layouts, controller switching and the live input tester |
| `node retrooasis/scripts/test-lan.mjs --browser --controller` | Real WebRTC streaming fixture with simulated guest controllers; check N64 analog/C-button mapping, disconnect neutralization and fresh input after reconnect |
| `npm --prefix retrooasis run test:disc-sets` | CUE/BIN grouping, M3U playlists, STORE zip packing |
| `npm run test:lan` | Real Socket.IO rooms, protocol versions, two/four-player capacity, controller-slot isolation and reservations, permissions, invites, reconnect credentials, HTTP/WebSocket isolation, sanitized signaling, analog/button bounds, quick-tap duration/cancellation, paused-packet replay guards, neutral release and stale-peer cleanup |
| `node retrooasis/scripts/test-lan-host.mjs` | Production host adapter with controlled WebRTC peers: all three guest ports, late disconnected packets, pause, control-channel readiness, timeout recovery, manual invite copying and cleanup |
| `node retrooasis/scripts/test-lan.mjs --browser` | Starts a generated canvas/audio host fixture after protocol tests; open the printed URL and join its invite in another tab to test real WebRTC |
| `npm --prefix retrooasis run test:link` | Trade & link: cartridge/save validation, GBA protocol choice, cartridge transfer framing, zipped ROMs; with built link cores (`npm run oasis:lan:link`) also GB↔GBC cable exchange through SameBoy boot ROMs and GBA per-console input/save round trips on the real WASM cores, plus gpSP's link-mode detection (Pokémon cable, Advance Wars cable, warning for games without link support) |
| `npm --prefix retrooasis run test:lan-service` | Settings service discovery: schema validation, protocol mismatch, static HTML fallback, network failures, timeout, cancellation, and detail-page compatibility |
| `npm --prefix retrooasis run test:lan-service -- --browser` | After building, serves the actual Settings app and a separate `/__test` response-control page on loopback; test retry, availability, errors and responsive focus without changing app code |
| `node retrooasis/scripts/test-n64-browser.mjs "C:\path\game.z64"` | Starts the real player with a supplied N64 ROM, raw per-port pulse controls, frame/input trace and fast-forward. Loopback only; removes its disposable ROM copy on Ctrl+C. Prepare cores first. |
| `node retrooasis/scripts/handheld/test-frame-clock.mjs` | Paired GBA hardware pacing at 30/60/120/144 Hz, bounded catch-up and pause reset; requires no core cache or ROM |
| `npm --prefix retrooasis run test:saves` | Save-slot listing, import/export, and database isolation |
| `npm --prefix retrooasis run test:covers` | Literal/URL filenames, metadata/region/article fallbacks, subtitles/sequels, linked-folder cover priority, manifest generation, scanner matching and service-worker refresh/offline behavior |
| `npm --prefix retrooasis run test:static` | Real Vite development routes: encoded filenames, HEAD, malformed URLs, missing files, sibling traversal and symlinks outside the public root |
| `npm --prefix retrooasis run test:covers -- --browser` | Cached/corrupt art, recovery, refresh races, signed URLs, retries after navigation, placeholders and cross-origin art under COEP; add `?live` to the printed URL to check real Libretro art |
| `npx eslint . --quiet` | Lint errors; existing warnings are omitted |
| `npm run build` | TypeScript, SPA production build and Pages artifact |
| `npm run minify` | Emulator JavaScript and CSS bundles |

The N64 fixture also requires `npm run oasis:build` so it can copy the bundled player frontend. The controller audit loaded the supplied Pokémon Stadium 2 cartridge through `./emulator/loader.js` and reached the running emulator with the bundled frontend.

Each browser command prints a fresh loopback URL. Open it and wait for the final PASS message. A FAIL message means the suite failed even if its server remains running. Stop each server when finished. `npm test` covers the command-line suites only; browser checks must also pass before release.

The save suite refuses to start on an origin with existing emulator databases and removes its own fixture databases on success. Controller browser tests simulate controller input and focus state against real DOM controls.

Before claiming device compatibility, also test a physical controller in Chrome and Safari: connect, wake, disconnect/reconnect, hold Confirm across a route change, return from another tab, and navigate menus with both D-pad and stick. Live-ROM save/load and gameplay checks require a suitable test ROM. Automated fixtures do not certify those hardware and gameplay paths.

For Settings → Controllers, check blocked access, custom layouts, connect/disconnect and selection of a second standard controller. Open the input tester and verify that A/B/Start/Select update its readout without activating menus or Back; close it and release buttons before resuming menu navigation. Check both stick values and the 390px layout. Node checks cover held-button/axis neutralization on disconnect, controller index replacement, startup assignment, pause/reset, focus recovery and forced releases through the actual emulator event handler while remapping is open. The October 4 audit passed 20 browser regression checks plus the Settings fixture. A real WebRTC N64 fixture delivered simulated A, right-stick C-left/C-down, and variable left-stick inputs to raw Player 2 port 1; disconnect neutralized every held input and reconnect accepted a fresh press. These are simulated controller checks; physical Bluetooth/USB hardware and multiple-device gameplay still need verification.

For Settings → Online play, use the service fixture to check available HTTP/HTTPS responses, missing service, protocol mismatch, malformed JSON, server error and timeout. While checking, host/join actions must have no URL and stay outside keyboard/controller navigation. Retry must restore its focus; returning from Choose a game or the real room-entry page must restore the corresponding action after discovery finishes. Navigate away during a pending check to verify it cannot repaint the next view. At 390px width, check for horizontal overflow, 44px controls, and wrapped setup commands. The October 4 settings audit passed these service states, desktop/mobile layout, arrow navigation, and host/join return-focus checks; the real LAN server opened the room-code form successfully.

The service fixture also offers **Open game detail** and **slow-ready**. Local Play and Options must remain usable during discovery. Open the metadata editor and type an unsaved title; when Host multiplayer appears, the form value and focus must stay intact. The final October 4 integration audit passed this check and the mobile pending-service action checks. Manual invite-copy fallback opens the collapsed invite section and selects its link when clipboard access fails. Service-worker tests hold cache writes pending to verify that background refreshes retain the worker until completion.

For LAN browser checks, verify guest video/audio, a Player 2 press followed by release, Reconnect, host pause/resume, room end, and server stop/restart. After a game connection failure, controls must release and disappear; a recovered connection restores them. Room end returns keyboard focus to the join code. Host Retry connection must recover without reloading the game.

Open the streaming fixture with `?core=n64` for the N64 profile. Select four players and join three guest tabs; verify independent ports 1–3, analog directions, Z and all C-buttons, releases, per-guest reconnect/removal and fifth-player rejection. Fixture input logs prove the transport and mapping, not a game's interpretation of those controls. Test an actual N64 multiplayer mode on separate LAN devices before removing the experimental label. Record emulation speed, stream frame rate, RTT and dropped frames over 20 minutes. Pokémon Stadium 2 in Downloads is a candidate; Ocarina of Time is only a loading/graphics check.

The four-player audit passed simultaneous guest A/C-left/C-down and variable analog holds on ports 1–3 over three real WebRTC connections. Removing the middle guest released only port 2, a replacement recovered that seat, and reconnecting Player 2 retained port 1 while Player 4 continued holding input. Pause neutralized all ports; a fifth browser was rejected. The seat roster displays open/reserved seats and host-side game/control readiness. All four seats remain visible above collapsed invite details. At 390px, the host panel had no internal overflow and the guest page had no horizontal overflow with 48px touch buttons. The supplied Pokémon Stadium 2 cartridge recognized four controllers and streamed live video to all three guest browsers. These same-computer checks do not certify four-device latency, physical controllers or sustained four-player gameplay.

The October 4 audit used the supplied Pokémon Stadium 2 cartridge in the real
player. Host Start/A/D-pad inputs reached the mini-game menus; guest A changed
the second participant from COM to 2P. Pichu's Power Plant ran with 1P and 2P
selected and reached its result screen. The guest streamed that game, enabled
sound and reconnected with the same slot. Touch-stick snapshots reached raw
port 1 with variable axis values and returned to zero. This is evidence of the
real player/transport path; it does not certify meaningful analog, C/Z gameplay,
four physical players, controller hardware, or performance under packet loss.

The [handheld prototype instructions](scripts/handheld/README.md) describe pinned compiler/source builds and separate Node-hosted WASM tests. GB/GBC tests verify 64-byte serial blocks, clock ownership reversal, normal/fast GBC timing, mid-transfer pause, cable removal, save-buffer rejection and distinct battery export/reload. GBA requires a supplied Advance Wars USA ROM and proves boot, video/audio callbacks, membership lifecycle, paired pacing, isolated controls and local packet exchange. Actual link gameplay, save UI and game-level recovery must pass before adding handhelds to LAN capabilities. Downloads ROMs for unsupported systems should still import and play locally with a clear multiplayer support message.

For Trade & link browser checks, build the app and link cores, put two fixture cartridges from `scripts/handheld/link-fixtures.js` in a hosted `roms/` folder, and open `link.html?rom=./roms/<host-rom>&system=gb` (or `gba`) on the LAN server. Join from a second browser and insert the other cartridge. The October 6 audit passed these checks over real WebRTC: GB host ↔ GBC guest exchanging 64 bytes, each player's downloaded save holding the bytes received from the other console, and the guest's imported save surviving. On GBA it also passed: guest A reaching only Console 2, host keyboard reaching only Console 1, a guest reconnect pausing both consoles without asking for the cartridge again, resume, End session delivering both saves, native-size guest video, and no horizontal overflow at 390px. A real Pokémon or other commercial link game still needs testing on separate devices before the experimental label is removed.

The October 6 follow-up audit added two checks. First, the host's RetroOasis library save: a seeded EmulatorJS `/data/saves/<rom>.srm` booted Console 1, and End session wrote the updated save back with a `.before-trade` copy of the previous one. Second, touch hosting on an emulated Pixel 7: the room panel sits in the page flow without covering the consoles, the GBA touch layout has 44px controls, a held on-screen A reaches Console 1 and releases cleanly, and touch controls stay hidden for mouse pointers.

The October 7 save-sync audit added three checks, using the same two-browser fixtures. In GB, both in-game saves synced with no button pressed. The host's library save matched the bytes received over the cable mid-session, with no backup because there was no earlier save. When the host closed the tab, the guest's page downloaded the synced save, holding the received bytes and the guest's own data, and said so. In GBA, several automatic library writes and the final End session write left the `.before-trade` copy as the pre-session save. `test:link` also checks the settle rule: a save is reported once, and only after two samples agree. A follow-up audit fixed two bugs. Library writes are now queued, so a manual Save to library during an automatic write can't replace the pre-session backup; a GB run with a seeded save and 40 manual saves kept it. End session with the guest gone used to report "Your guest received theirs"; it now downloads their save on the host and says so.

The October 6 library and Add ROM audit checked several behaviours. Every file in a batch is reported: non-game files and orphan disc tracks are skipped with a reason; unknown extensions are saved when a system is chosen and skipped with a hint in Auto-detect. A batch with skipped files no longer launches the player. On phones the filter chips form one swipeable row of 44px chips with the active filter in view. Real games list before labelled samples. Keyboard Up/Down move between the search box and the grid; spatial navigation now measures edge gaps, so a wide control above a tile is reachable. The route-focus outline around the page is gone. The System picker in Add ROM and the metadata editor is grouped by maker. The controller navigation browser suite (`node retrooasis/scripts/test-gamepad.mjs --browser`) passed all 23 checks.

The October 6 controller and Settings audit drove the built app with a scripted standard-layout controller. It covered:

- **Back.** B / Escape never leaves RetroOasis: a fresh tab or shared link on a game page goes game → library → home, and B at home does nothing. Back uses `history.back()` only when the previous entry is in-app; the depth is tracked in `history.state`, so reloads are covered.
- **Escape handling.** B acts like Escape first: it closes the game page's Options menu, cancels metadata edits and clears a library search. Keyboard Escape inside text fields is unchanged.
- **Library position.** Returning from a game refocuses the same library tile.
- **Settings.** L1 / R1 jump between Settings sections. Holding B for 1.5 s closes the button tester without triggering Back.
- **Initial focus.** Settings no longer focuses its first tab for mouse or touch users; the first D-pad press still focuses it.
- **Touch targets.** Phone Settings controls are at least 44px.

The October 6 cover art audit used a hosted manifest of nine real game names plus two homebrew titles, against the live Libretro thumbnail host. All nine real games matched their exact art: regions, `(SGB Enhanced)`, `Legend of Zelda, The` and Game Boy Color fallback. The homebrew titles kept placeholders. Request counts went from 34 → 28 on a revisit and 34 on a reload, to 34 → 7–9 cached hits on a revisit and 9 on a reload, because remembered misses make no requests. Box art is contained, not cropped, and its blurred backdrop is drawn from the loaded image with no second request. The cover browser suite (`node retrooasis/scripts/test-covers.mjs --browser`) passed all 33 checks.

The October 6 storage and offline audit used the production build behind its service worker and checked four things:

- **Offline box art.** Libretro covers are cached through CORS in `retrooasis-covers-v1` (600 entries), not as opaque responses that would count as megabytes of padded quota each. With the network cut, a reload kept the hosted library list (`roms/manifest.json` is network-first with an offline fallback) and every matched cover.
- **EmulatorJS cache cap.** `player.html` limits EmulatorJS's own cache to about 10% of quota (256 MB–1 GB) for 7 days, instead of 4 GB of copies of library ROMs.
- **Storage breakdown.** Settings → Data shows saved ROMs, emulator cache and app/cover cache.
- **Clear cache.** Clear cache deletes only `EmulatorJS-Cache` and hands focus to Manage saves.

The October 6 N64 streaming audit used the `test-lan.mjs --browser` fixture with `?core=n64`. Guests went from 30 fps to 60 fps. The sender applied a `motion` content hint, max 60 fps, 8 Mbps, `maintain-framerate` and 720-line scaling. The controls channel is `ordered: false, maxPacketLifeTime: 120`, and guest `jitterBufferTarget` is 0. Loopback input latency stayed at about 2 ms median. A four-player room held 60 fps on all three guest streams with no encoder quality limitation, and roster RTTs showed. The fixture canvas is 256×240, so encoding cost for a real N64 core, and Wi-Fi latency on separate devices, still need hardware testing. The fixture now copies the Trade & link modules that `lan-guest.js` imports; without them the guest page failed to load.

The follow-up N64 checks covered three things in the same fixture:

- **Walking.** Shift halves keyboard stick tilt (32767 → 16384 on port 1) and releases cleanly.
- **Stream rate.** WebRTC stats forced to report CPU-limited encoding stepped every guest stream to 30 fps with a host status message, and it returned to 60 fps after 30 healthy seconds.
- **Landscape touch layout.** On a Pixel 7 in landscape, the game, stick and every N64 control fit on screen at once (15/15; NES 9/9). Portrait and desktop have no horizontal overflow.

The October 6 keyboard audit had three parts:

- **App navigation.** Tab order, visible rings and the skip link were checked on every page; no traps were found. Home keeps Tab inside its console shell by design.
- **Shared layout.** LAN guests and the Trade & link host had A/B and X/Y swapped relative to the RetroOasis player. They now share `keyboardLayout()` (public/lan-capabilities.js), which `test-lan.mjs` checks against EmulatorJS's `defaultControllers`; a mutation test confirmed the guard fails on a swapped key.
- **Fixture presses.** In the WebRTC fixture each key reached the expected input: NES Z/X/V/Enter/arrows, and N64 Z→Z, X/S→A/B, Q/E→L/R, I→C-up, arrows/T→stick, numpad 8→D-pad up. Tab stays with the browser.

## Core loading

This sandbox can't reach `cdn.emulatorjs.org`, so the October 7 core-loading audit used Playwright to route that host to a fake CDN. It served a core report, a zipped stub core, and the real `data/compression` workers. Two bugs reproduced before the fixes:
- An N64 core cached online failed offline. Without the report, the player asked for the `-legacy` build, which had never been downloaded.
- A missing local core fell back to `cdn.emulatorjs.org/4.3.0-pre/`, a folder that doesn't exist. Stable failures also retried a second CDN build.

After the fixes, all of these passed:
- Online then offline, the cached core ran with the same variant.
- A core 404 on Stable showed "Couldn’t download the emulator" with the file name, a focused Try again and Try Nightly, and no second CDN request.
- Try again reloaded with an `idb:` staged ROM still available and started.
- Try Nightly restarted on Nightly.
- Offline with nothing cached showed "You’re offline".
- Local with no local cores loaded the Nightly report and the WebGL 2 core, with no update-check request.

The error screen has no horizontal overflow at 390px. When retesting with a stub core, give it no empty files: the cache treats a zero-byte file as corruption and discards the entry.

## October 7 branch audit

Four parallel reviews covered the whole branch: Trade & link, LAN online play, the app shell, and caching/core loading. Each finding was confirmed in code before it was fixed.

**Trade & link**
- Clock carts (MBC3, HuC3, TPP1) never auto-synced, because SameBoy appends a ticking RTC footer. `test-link` now builds an MBC3+timer cartridge, confirms the footer changes between exports, and checks that settling compares cartridge RAM only.
- A guest dropping or rejoining while Start link loaded the cores is now handled.
- Saves count as delivered only after the guest page's receipt. A dropped guest fails fast.
- The `.before-trade` backup flag handles sessions that start with no library save.
- Guests who join after End are told the session is over.
- A cartridge with no battery gets its own message.
- `/link/` serves only the bytes that passed verification, and any changed file forces re-verification.
- The host shows library and guest auto-saves side by side.
- The two-browser e2e passed all 30 checks on three consecutive runs.

**LAN online play**
- Control changes are repeated every frame for 120 ms, so a lost press or release on the lossy channel is covered.
- The roster redraws only when the round-trip time moves by 20 ms or more.
- Stream-rate recovery backs off (doubling, capped at 8×) and resets when a room ends.
- Names and titles drop invisible and bidi-override characters.

**App shell**
- With a system chosen, Add ROM no longer saves `.sav`, `.state` or memory-card files as games, and a save dropped with its game still auto-launches the game.
- Cover misses are remembered only when every host they tried has served art this session.
- A bare URL keeps router depth 0.
- The skip link focuses the shelf instead of routing to #ro-main. A browser check passed with the fix and failed without it.

**Caching and core loading**
- The service worker precaches the player frontend and keeps the hosted library list across updates.
- A 5xx or SPA fallback page for a player file is served from the last good copy and never cached. A 404 still surfaces.
- An item larger than half the EmulatorJS cache is no longer cached, so one large game can't evict every core.
- `startError` fires after the page's listeners are attached.
- Clear cache empties the stores instead of deleting the database. A blocked delete used to stall every later game load.
- The usage count skips EmulatorJS's key-index record.
- LAN host mode hides EmulatorJS's own start button until the prepared-core check finishes.

`test:static` now expects 404 rather than 403 for backslash traversal off Windows, where a backslash names a file rather than separating paths. It still asserts that nothing outside the ROM folder is ever returned.


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

## Home screen (XMB) audit

The October 7 Home audit drove the built app in Chromium at 1440×900, 1100×760, 1024×640, 1280×480, a 390×844 phone and an 844×390 landscape phone.
- **Item column alignment.** It was measured while the category strip was still sliding, which left the selected game up to a category off (a NES game drawn over the SNES icon), even after returning Home. It now follows where the icon will settle: the icon and thumbnail centres matched within 1 px at 50 ms, 300 ms and 1.5 s after moving.
- **Trackpad swipes.** One swipe with inertia (60 decaying events) moved 4 categories; it now moves 1. Separate mouse-wheel notches still step each time, and a continuous spin steps about every 400 ms.
- **Stray line.** A focus ring around the whole menu drew a line across the bottom after keyboard use. It's gone, and the highlighted item remains the focus indicator.
- **Overlap.** The selected item's title no longer lets neighbouring category icons show through. The info panel stays below the clock at every tested height.
- **Clock.** The clock and date follow the browser locale (12- or 24-hour).
- **Phone hint.** The pill sits inside the margins and says "Swipe the icons · tap to open".

## Downloads ROM audit (real games)

The October 6 audit used commercial ROMs and two battery saves supplied in Downloads, on Windows 11. Two Playwright Chromium contexts, host and guest, ran on one computer against a loopback LAN server. Saves were copies; the originals were never written.

**Setup on Windows.** `npm run oasis:lan:link` failed twice. It now fetches the pinned RGBDS win64 release and runs it with Windows' own `tar.exe`. It also runs the Emscripten-built `pb12` compressor as `.cjs`, because `retrooasis/package.json` is `"type": "module"`. A rerun with no RGBDS, boot ROMs or `pb12` rebuilt boot ROMs identical to the first build. `npm test` and core-backed `test:link` passed.

**Trade & link**
- **Pokémon Crystal ↔ Crystal (GBC).** Both consoles booted the same supplied `.srm`, flew to a Pokémon Center and passed the Cable Club handshake and pre-link save. Each saw the other trainer in the Trade Center, then traded Abra for Pidgeotto. Both copies of each downloaded save held the new party, and End session delivered both saves.
- **Pokémon Ruby ↔ Ruby (GBA, Pokémon cable).** Console 1 led a "2P LINK" and both reached the Trade Center. They traded Latias for Flygon, both auto-saved, and End session reported delivery. Decoded saves held the traded party: the guest's download, and the host's RetroOasis library save at save index 155. There was no `.before-trade` copy, because the session started without a library save.
- **Tetris (GB, 2PLAYER).** The consoles negotiated Mario vs. Luigi. A guest height change showed on both consoles, and the versus match ran with the opponent's stack meter.
- The guest inserted zipped ROMs (Tetris) and unzipped ones (Crystal, Ruby).

**LAN online play**
- **Mario Tennis (N64).** The guest picked Baby Mario on Player Select and moved them in a singles match, while Player 1 stayed put. The guest's A, Start, stick, C-up and Z reached raw port 1 and released. Reconnect kept the seat, and pause stopped frames.
- **Contra (NES).** The guest ran Lance right on stage 1 while Bill stayed put.
- **Streets of Rage 2 (Genesis).** The guest moved the 2P cursor on Select Player.
- **Stream rate not certified.** Headless and headed captures gave 8–16 fps. A trivial WebGL canvas in the same page also captured at about 16 fps, and the machine was at 100% CPU from other work. Emulation itself ran at 52–60 fps. The October 6 N64 streaming target (60 fps) still needs a quiet machine or separate devices.

**Add ROM.** Bomberman Max – Red Challenger (zip, auto-detected as Game Boy) ran at 60 fps. Mega Man 64 (`.z64`) ran at about 52 fps. Dragon Ball Z: Ultimate Battle 22 (PS1, 212 MB zip of BIN/CUE) extracted and played its intro at about 51 fps.

Some guest key taps landed as turns, or were dropped in Crystal's start menu. Host taps were dropped the same way, so it wasn't transport loss. The October 7 audit below traced it to catch-up batching on a busy host and fixed it.

## Online play and Trade & link batch audit (October 7)

Two Playwright harnesses ran every game through the same checks in host and guest Chromium contexts, against a loopback LAN server on Windows 11 with GPU. The checks covered 24 online games and 27 link pairings.

**Online play: 24 games.**
- N64 (4): Mario Tennis, Mega Man 64, Ocarina of Time, Harvest Moon 64.
- NES (10): Contra, Super Mario Bros., Ice Climber, Double Dragon II and III, Bomberman II, Battletoads & Double Dragon, SMB2 (J), Chip 'n Dale, Nintendo World Cup.
- Genesis (10): Streets of Rage 1–3, Gunstar Heroes, Mortal Kombat II and 3, UMK3, Contra: Hard Corps, Golden Axe, NBA Jam TE.

Every game passed: boot, room, join and stream, every mapped guest key on raw Player 2 with release and nothing on port 0, reconnect with the same seat and live input, pause and resume, and end room. SNES was not covered, because there were no SNES ROMs.

**Trade & link: 27 pairs.** Every pair linked, streamed Console 2 at native size, and ended cleanly.
- GB/GBC (15): Gold ↔ Silver, Crystal, Tetris DX, SMB Deluxe, Bomberman Max Red ↔ Blue, Mario Tennis, Mario Golf, Pokémon TCG, Pokémon Puzzle Challenge, Dragon Warrior Monsters, Yu-Gi-Oh! DDS, Tetris, Dr. Mario, F-1 Race, Tetris ↔ Tetris DX.
- GBA (12): Ruby ↔ Sapphire, FireRed ↔ LeafGreen, Emerald, Advance Wars 1 and 2, Mario Kart SC, SFA3, Sonic Battle, MMBN, Puyo Pop, Mario Tennis Power Tour, F-Zero MV.
- Both consoles boot the same ROM frame-identically, so the guest-only Start/A test checks that Console 2 diverges.
- GBA modes: Ruby/Sapphire link over the Pokémon cable, FRLG, Emerald and Mario Tennis Power Tour over the Wireless Adapter, and Advance Wars over its own cables. The other GBA games correctly warned that they have no link support.

**Fixes**
- **Dropped taps in link rooms.** Both consoles run in catch-up batches per animation frame. On a loaded host, a tap's press and release could land between batches, so the game never saw it. Pokémon Puzzle Challenge and Yu-Gi-Oh! missed every guest Start, even after a 20 s boot wait. `holdTaps` now keeps each press for at least two emulated frames, and all six reruns diverged. `test:link` covers deferral, the per-batch cap, pause flushing and re-pressing, and a mutation run failed it.
- **Guests see host pauses.** A host pause used to freeze the guest's picture while it still read "Connected". The host now sends the pause state on the controls channel when it changes, when a guest's controls open, and every 2 s, since that channel drops late packets. The guest shows "The host paused the game." over a dimmed stage. `test-lan-host` covers all three cases, and a mutation run failed it.
- **Stream started at 288×180.** WebRTC starts near 300 kbit/s and took 15–25 s to reach 720p, so every guest began blurry. The host now adds `x-google-start-bitrate=2000` to the guest's answer, including VP8, which has no fmtp line. 720p arrives in 2–5 s. A first version with a 1 Mbit/s floor cost frame rate on the loaded test machine, so there is no floor. An interleaved A/B without it averaged 37.5 vs 39 fps, within noise.
- **Room panel covered the game.** The fixed 340 px panel hid about 23% of the picture all session. It now folds to "LAN multiplayer · 2/2" once every seat is ready, with focus kept on its header. It reopens when a guest drops, and a host who toggles it keeps their choice. Link rooms opt out, because that panel sits beside the consoles.
- **Phone layouts.** In link rooms, the guest's cartridge box sat between Console 2's video and the touch controls, which were about 1000 px down. It moves below them while the link runs, so video and controls fit on one 844 px screen. The host page scrolls to Console 1 on Start link, and Console 1 with its touch pad fits on one screen.
- **Link guidance.** Wireless-adapter links tell players to use the Union Room. Ruby/Sapphire paired with FRLG/Emerald explains why they can't link here, and the README no longer says every Pokémon game uses the cable.

**Not certified**
- Stream frame rate. The test machine stayed at 99–100% CPU from unrelated workloads, and guest fps varied from 2 to 59 between identical runs.
- Wireless-adapter trading in FRLG/Emerald. It needs saves in progress.
- Separate physical devices.
- EmulatorJS online rooms could drop taps the same way when the host's frames stall. That path has no frame hook and was not changed.

## Stream speed, online UI, PlayStation rooms and party games (October 7)

**Stream speed.** Interleaved A/B runs on the busy test machine compared Chromium's default VP8 encoder with H.264. VP8 took 18–56 ms per frame and slowed the host game to 10–48 fps. H.264 took about 12 ms and kept it at 60. The host now puts H.264 first (`preferredVideoCodecs`), with VP8 as fallback. Streams are capped at 480 lines, the highest native resolution of any supported console, down from 720; that cut encode time from about 12.5 to 9 ms per frame. `test:lan` covers the codec order and the cap.

**Online UI.**
- The guest join page is a card with numbered steps.
- The play view has a top bar with the seat chip and a colour-coded quality pill.
- A rounded stage keeps the touch controls directly under it, so on a 390×844 phone the N64 game and all its controls fit without scrolling.
- Status messages appear under the game. The key list and room seats sit in collapsible cards.
- On-screen controls are on by default for touch screens only, with a remembered toggle.
- Roster rows have status dots.
- The host panel's invite link and QR code fold away when the room is full, and its primary action is highlighted.
- Trade & link hides the duplicate Pause button.
- No horizontal overflow at 390 px, 844×390 landscape or desktop.

**PlayStation rooms (new).** `psx` uses the pinned `pcsx_rearmed` stable build (checksums in `lan-core-lock.json`; prepare with `npm run oasis:lan:prepare -- --core pcsx_rearmed`). It has 2 seats, the D-pad and all eight face and shoulder buttons. Keys match the player, except L2 is W because the player's Tab would move page focus. The batch harness passed key delivery, reconnect, pause and end room for Dragon Ball Z UB22, Tekken 3, Mortal Kombat Trilogy, Marvel vs. Capcom, Bloody Roar 2, Fighter Maker, Jedi Power Battles and Board Game Top Shop. In Tekken 3 the guest pressed P2 Start as a challenger, picked King and fought Xiaoyu.

**Super Smash Bros. (4 players).** A 4-player room with three guest browsers showed HMN on all four slots. Each guest moved its own hand cursor (DK and Link) with live previews, and the match ran on Peach's Castle.

**Mario Party 3.** Four seats connected. In Duel Map the guest on port 1 moved the P2 hand and picked Waluigi, while port 2 presses reached their own port and were correctly ignored.

**Not done**
- Perfect Dark and Pokémon Stadium 1 and 2 (Transfer Pak). No ROMs were available.
- PlayStation analog sticks and multitap.
- Stream frame-rate certification. The machine stayed at 99% CPU from other workloads.

## Online frame rate, guest polish, Transfer Pak and save-loss fixes (October 7)

**New games.** Super Mario World and Super Mario All-Stars (the first SNES ROMs), Perfect Dark and Pokémon Stadium 2 passed the online harness: key delivery, reconnect, pause and end room. The final regression pass covered SNES, N64 (6 games), NES, Genesis and PlayStation.

**Frame rate.** A per-stage probe measured capture, encode, send, receive, decode and display rates.
- **Capture.** Encode, send and decode kept up. The loss was at capture: `captureStream(60)` drops frames that land just under 16.7 ms apart, so only 37–44 of 60 game frames were captured. Plain `captureStream()` captured 48–59, and the encoder's `maxFramerate` still caps the stream.
- **Measurement.** Guest frame rate now uses the compositor's `presentedFrames` counter. The earlier `requestVideoFrameCallback` count understated it by about a third.
- **Jitter buffer.** Guest jitter-buffer targets of 0, 20 and 40 ms showed no consistent difference, so 0 stays for the lowest latency.
- **Native rates.** Perfect Dark and most N64 games render at 20–30 fps natively, and the stream matches.

**Guest polish.**
- The first key press or tap turns sound on, and "Sound on." confirms it. If the browser refuses unmuted playback, the stream plays muted instead of freezing.
- A lost game connection rejoins automatically with the same seat: "Connection interrupted. Reconnecting automatically", then "Joined", then "Connected" in about 2.8 s, down from 11 s. The closed controls channel triggers it, because the peer connection keeps reading "connected" for about 8 s after the host closes it. It backs off 2, 4 and 8 s, then hands over to the Reconnect button.
- A "Gamepad ready" chip appears in the top bar.

**N64 Transfer Pak.** mupen64plus-next reads the Game Boy cartridge only through libretro's "N64 Transferpak" subsystem. The player starts the core with `--subsystem gb /tp.sav /tp.gb <n64 rom>` and the `mupen64plus-pak1 = transfer` option, with no EmulatorJS change (`public/transfer-pak.js`). An N64 game page lists library GB/GBC games as cartridges and remembers the choice. End to end through the UI, Pokémon Stadium 2 with the supplied Crystal ROM and save showed the trainer (MATTHEW, ID 55944) on Game Pak Check. Pokémon Stadium 1 needs a Red, Blue or Yellow ROM, which wasn't available.

**Data-loss bugs fixed**
- **Every battery save was deleted on leaving the player.** EmulatorJS's exit handler saved, then unmounted `/data/saves` at once. The queued IDBFS autoPersist then synced the empty mount point and deleted every save in the database. It reproduced three times with the real import path, and disabling the unmount kept the saves. `GameManager.js` now persists, then unmounts. After the fix a save survived two play sessions and loaded back.
- **Library saves used the wrong path.** `library-saves.js` read and wrote `/data/saves/<game>.srm`, but the player saves under the core's folder (`/data/saves/Gambatte/…`). Trade & link's "Use my RetroOasis save" and its write-back never met saves from normal play, and earlier audits seeded that wrong path themselves. `libraryCartSave` now finds the newest save in any core folder, writes there or to the system's player folder, and creates the folder entry.
- **Fixed-name scripts were stale after updates.** The service worker served `library-saves.js`, `link-host.js` and similar modules stale-while-revalidate, so the first visit after an update mixed module versions and failed on a missing export. They are now network-first with an offline copy, and the shell cache moved to v12.
- **Blank cartridge saves.** A Transfer Pak session started with no save no longer writes blank cartridge RAM into the library.

**MIT/GPL projects.** Already in use: socket.io and qrcode (MIT), SameBoy (MIT), gpSP (GPL), EmulatorJS (GPL). Rollback netplay (GGPO, MIT) would help fighting games most, but needs deterministic state hooks inside each WASM core. simple-peer and nipplejs would replace working code, and coturn only matters for internet play. None were added.

## PlayStation analog sticks and Mario Party 3's four-player board (October 7)

**PlayStation analog.** PlayStation rooms now carry both sticks. The profile flag `dualAnalog` adds a `stick2` field to control packets. The host applies the left stick to axes 16–19 and the right to 20–23. Right-stick axes are never accepted as buttons, and other systems reject `stick2`.
- **Keyboard:** T/F/G/H and I/J/K/L, the player's own defaults.
- **Gamepad:** both sticks pass through as real analog, never as D-pad presses.
- **Touch:** the left stick appears on screen.
- **Core:** the pinned pcsx_rearmed core has no port-device export, and RetroArch ignores `input_libretro_device_pN` in `retroarch.cfg`. The host therefore writes a core remap (`config/remaps/PCSX-ReARMed/PCSX-ReARMed.rmp`) before the core starts (`ejs-start-hooks.js`, shared with the Transfer Pak). The core log changed from `port: 1 device: standard` to `device: dualshock` on both room ports.
- **Digital games:** DualShock starts in digital mode. A Tekken 3 rerun in that mode let the guest join as the P2 challenger and pick King with the D-pad, as before.
- **Live check:** a guest's T and L reached raw Player 2 axes 19 and 20 at full tilt and released.
- **Layout:** the phone layout in both orientations has no overflow, and the landscape view puts the stick and D-pad under the left thumb with all eight buttons on the right.
- **Tests:** `test:lan` and `test-gamepad` cover packets, validation, keys and gamepad mapping.

**Mario Party 3, four players.** A 4-seat room with three guest browsers reached the Battle Royal Map, Chilly Waters, with "4 Players" selected.
- **Character select:** all four selection hands moved at once, each from its own controller. The picks were Mario (host), Waluigi, Peach and Daisy.
- **Turn-order roll:** each guest's A stopped only its own dice block (7, 9 and 1) while the host's kept spinning.
- **Navigation notes:** the hub's blue star is Battle Royal. Its player count defaults to 1 player and 3 CPU. B at the hub exits to the title.

## Online UI/UX overhaul (October 7)

The plan is in [docs/plans/online-shippable.md](../docs/plans/online-shippable.md). Before/after screenshots covered every online surface on desktop (1366×860) and phone (390×844): Home, Library, Settings → Online play, NES/N64/GB game pages, join, host panel, guest play, and the Trade & link host. Every surface now uses the app's tokens, fonts, accent and buttons.

Regression after the overhaul:
- **Tests:** full `npm test` (27 suites), lint and typecheck.
- **Online harness:** Contra, Super Mario World, Streets of Rage 2, Tekken 3 (22 inputs including both sticks) and Super Smash Bros. Each passed key delivery, reconnect, pause and end room.
- **Link harness:** Gold ↔ Silver, Ruby ↔ Sapphire and Crystal ↔ Crystal linked, and Console 2 responded to the guest.
- **Trade & link tracker:** it advanced cart → room → guest cartridge → start in a live session.

## Guest lobby, Pokémon Stadium with Blue, and a full online audit (October 7)

**Guest lobby.** Guests now wait in a lobby that covers the stage until the host's game is on screen. It shows "You're Player N", the game and system, the seat cards (yours outlined), a step tracker and the controls. It comes back as a paused, reconnecting or lost state, with Reconnect as its one action. A browser harness checked every state on desktop, phone portrait and landscape, with no overflow:
- **Link room:** connecting → insert your cartridge → waiting for the host to start → gone once the link runs. After inserting, the page scrolls back to the lobby.
- **LAN room (Contra):** connecting → game on screen; the host's Pause shows the paused state over the frozen game.
- **Dropped connection:** closing the host's peer showed "Connection interrupted · attempt 1 of 3" and recovered in 2.5–2.8 s.

**Pokémon Stadium + Pokémon Blue** (a real 255-hour save: trainer NICK, 8 badges, a full Pokédex), all through the app:
- **Setup:** Add ROM took `Pokemon Stadium (USA) (Rev 2).zip` (a zip with an extra `.txt`) and Blue. The `.sav` went in through Blue's player (**Import Save File**), and Blue's Continue screen showed NICK.
- **Game Pak Check:** NICK, ID 04445 on controller 1. Stadium asks for a save made in a Pokémon Center, so Blue was re-saved in the Viridian Pokémon Center (Fly, then save). After that the cartridge passed cleanly.
- **Pokémon Lab:** the PC listed the party (six at L100) and GB Box 1 (MEW, MACHOP, BELLSPROUT, VENOMOTH ×2, GEODUDE… 20/20).
- **Save safety:** at boot Stadium writes to Gen 1's sprite scratch area (`0x0000–0x0425`). The trainer data, boxes, Hall of Fame and checksum stayed byte-identical, and the earlier save was kept as a backup.
- **GB Tower doesn't work.** Stadium reports "The Transfer Pak is not set properly". EmulatorJS's `mupen64plus_next` build (2025-06-14) predates mupen64plus-core's fix ([#1154](https://github.com/mupen64plus/mupen64plus-core/pull/1154), 2025-10-08), which also needs a low-level RSP. The game page now says so.

**More cartridges:**
- **Stadium + Red, Stadium + Yellow (no saves):** each cartridge was recognized; Stadium showed "Saved file not found".
- **Stadium 2 + Blue:** read NICK at 60 fps; Stadium 2 takes Gen 1 cartridges as well.
- **Stadium 2 + Crystal:** read MATTHEW, ID 55944.
- **Stadium 2 + Gold (no save):** recognized; "Saved file not found".

**Fixed along the way:**
- **Junk saves.** Stadium writes scratch data into cartridge RAM as it boots, so a cartridge with no save got a junk "save" in the library. A cartridge that starts without a save is now never written back. Blank detection also ignores the two bytes Gold and Silver mark on first boot, and the untouched RAM the player stores when a game closes.
- **Titles.** Color headers read past the maker-code bytes only when they aren't a code, so Yellow shows "POKEMON YELLOW", not "POKEMON YEL". Transfer Pak and link status lines use the file name ("Pokemon - Gold Version") instead of header codes like "POKEMON_GLD".
- **Transfer Pak card:** now three short facts (games, save, not yet) instead of a paragraph.

**Audit and browser compatibility:**
- **Wake lock.** The EmulatorJS build's screen wake-lock request threw an uncaught error where the browser refuses it (battery saver, headless); the player now absorbs it. Page errors in the audit runs went from four to none.
- **iOS 15 and older Safari:** `AbortSignal.timeout` has a fallback (the guest page would otherwise fail before joining), `Array.prototype.at` is gone from the online scripts, and the online pages get solid stand-ins where `color-mix()` is missing (Safari < 16.2, Firefox < 113).
- **Fullscreen:** iPad uses the prefixed call; on iPhone, which can't make a page element fullscreen, the button is hidden instead of doing nothing.
- **Copy invite:** on plain-HTTP LAN addresses with no Clipboard API, it falls back to the copy command.
- **Host panel:** the note is now just "Keep this tab open while friends play." (the seat card already says "You · host").
- **Not covered:** only Chromium engines are installed here, so Firefox and WebKit/Safari weren't run; the compatibility fixes above come from reading the code.

**Regression:**
- **Tests:** full `npm test`, lint (0 errors), typecheck and build.
- **Online harness:** Contra, Super Mario World, Streets of Rage 2, Tekken 3 and Super Smash Bros. passed keys, reconnect, pause and end with no issues.
- **Trade & link:** the stepper passed a live Crystal session.

## Cross-browser and mobile audit (October 7)

**Browsers.** Playwright's Firefox (from 1.59) and WebKit 26.4 builds ran the same checks as Chromium:
- **Firefox:** every page (Home, Library, Add ROM upload, game page, Settings, Saves) at desktop and phone sizes with no overflow or page errors. The player ran Contra at 45 fps (headless). An online guest, desktop and phone, saw the lobby clear and video play, and its Z key reached Player 2 on a Chromium host. A link guest inserted Crystal and reached "Waiting for Host to start the link".
- **WebKit:** all 12 pages render with no overflow or page errors. The Windows WebKit build has no WebRTC or MediaRecorder, so the guest page shows its "does not support WebRTC" message and the player can't start; real Safari has both, and stays a separate-device gate. That build also draws variable fonts at their thinnest weight, which real Safari doesn't.
- **Fixed:** the guest's frame-rate readout used `framesPerSecond`, which Firefox reports as 0 while playing. It is now measured from frames decoded between polls (unit-tested in `test:lan`).

**Mobile (390×844 and 360×740 upright, 844×390 sideways):**
- **Touch:** a real tap on the on-screen A button reached Player 2 on NES, N64 and PlayStation rooms in both orientations. The controls never cover the game and nothing scrolls sideways.
- **Fixed, upright:** on N64 and PlayStation, Start (and Select) were below the fold. While playing, the site header now hides on phones, controls are tighter, and Start/Select share a row, so the game and every button fit on one screen.
- **Fixed, PlayStation layout:** the touch layout matches a DualShock: L1 L2 R2 R1 in a row and △ □ ○ ✕ as a diamond, with the diamond (and the N64 C-buttons) under the right thumb.
- **Fixed, player:** upright phones draw the game from the top, under the Exit bar; the game now starts below the bar. EmulatorJS's on-screen gamepad appears for phone user agents.
- **Fixed, tap targets:** breadcrumbs and header links get 44 px hit areas on touch screens without moving.
- **Menus:** the navigation menu opens upright; sideways, the links show inline.

**Regression:** full `npm test`, lint (0 errors), typecheck and build.

## Save tools, portable room host, Settings overhaul (October 7)

**Saves:**
- **Phones.** The player writes in-game saves to storage whenever the page is hidden (`visibilitychange` / `pagehide`). EmulatorJS's own timer runs every 5 minutes. In the test, a `pagehide` updated the IndexedDB save in about 40 ms, without leaving the player.
- **Save data card on each game page.** The player records each game's save path when it starts. The card shows "No save yet" for untouched cartridge RAM. **Use a save file** started Crystal with your `004 Pokemon-Crystal Version.srm`, byte-identical in the core; the player bar read "Using your save file…". A second import kept the first as the previous save, and **Restore previous save** swapped them back (and can itself be undone).
- **Saves page:** rows are named by game: "crystal", "Previous save · crystal", "Clock · crystal" (Crystal's real-time clock file).
- **Tests:** `test:link` covers the pending-save handoff (used once, only by its own game) and the save-path map.

**Online play:**
- **Two methods, one vocabulary.** Settings, game pages, the join page and Trade & link now describe **Online rooms** (you host the game, guests need no ROM) and **Trade & link** (each player brings their own game and save), both on a **room host**. "Room service" and "LAN server" are gone from the UI.
- **Portable room host.** `npm run oasis:host:pack` builds a 15 MB folder: one bundled `server/server.mjs` (Socket.IO included), the app, the emulator files, the cores, the link cores, and start scripts for Windows and Linux. Copied outside the repo and run there, it hosted a Contra room (lobby cleared, the guest's key reached Player 2) and opened a Trade & link room with no errors.
  - **Fixed along the way:** the bundle first crashed on Socket.IO's `__dirname`. It now runs under a CommonJS banner and ships Socket.IO's browser client.
- **Over the internet:** rooms now also accept `100.64.0.0/10` (Tailscale and other virtual LANs). The rest of `100.0.0.0/8` and public addresses are still refused (unit-tested). Docs cover Tailscale, Nebula (MIT) and ZeroTier.
- **Opt-in browser test in the repo:** `npm --prefix retrooasis run test:online-browser -- --room nes=<rom> --room n64=<rom> --link gb=<rom> --browsers chromium,firefox`. It passed 24 of 24 checks: NES and N64 rooms (lobby, video, input to Player 2, pause and resume) and a Game Boy link, with Chromium and Firefox guests. Without Playwright it prints how to install it and skips.
  - **What it caught:** a player change that would have stopped every game from starting (a top-bar label used before it was declared). Fixed before any commit.

**UI:**
- **Settings overhaul.** Sections: Appearance, Sound, Controllers, Online play, Library, Saves & storage, Advanced (emulator files, thread support, self-hosting).
  - **Desktop:** a sticky section rail that marks the section on screen.
  - **Phone:** a sticky, swipeable chip row pinned under the header, scrolled to the current section.
  - **Online play** shows the two methods side by side, then room host status, Host, Join and "Set up a room host" (portable host, project setup, internet play, troubleshooting).
- **Player bar:** the default Stable channel is no longer shown ("Game Boy · playing"); other channels and "Online room" still are.
- **Add ROM** with one game now opens its game page (Play, online, Save data) instead of starting it.

**Regression:** full `npm test`, lint (0 errors), typecheck and build; lobby harness (every state, drop recovered in 2.9 s); in-repo online browser test (24/24).

## Online play menus and instructions audit (October 7)

Every online surface was walked as a first-time user: Settings, the game-page cards, the host panel, the join page, the guest view, Trade & link and the portable host's README. Changes:
- **Invite addresses are labelled and ranked.** The host panel used to list raw IPs in no order. On the test PC it offered a WSL/Hyper-V adapter (`172.23.96.1`) that guests can't reach. Options now read "Wi-Fi · 192.168.1.210:8797", then Ethernet, then Tailscale (internet), and "Virtual machine adapter" last. The default is the best one. The room host's window labels them the same way. Unit-tested (`describeAddresses`).
- **Host panel:** one plain lede per method. Rooms say friends join from their browser and see your screen. Trade & link says your friend plays Console 2 with their own game; it used to claim "everyone sees this screen". The panel is now named "Trade & link" (it was "Link room"). Status lines are single and plain ("Ready. Enter your name and create a room.", "Room open. Send the invite…").
- **Trade & link page:** the intro, save-file hint and save warning are each one short sentence.
- **Join and guest pages:**
  - The footer no longer says "same LAN only", which contradicted internet play. It now reads: keyboard and touch always work; controllers need a secure host.
  - The two methods are explained in one line each.
- **Settings → Online play:** plain room host status, and "Set up a room host" is three numbered steps (install Node.js, run start-host, open localhost and host), then one line on internet play and one on fixing connections. Developer commands are folded away.

**Regression:** full `npm test`, lint (0 errors), and the in-repo online browser test (NES room and Game Boy link, Chromium and Firefox guests) passed.

## Online play in everyday language (October 7)

Every word a player sees in online play was rewritten without technical terms, then read back in a full capture of every screen.
- **Names:**
  - The program on the hosting computer is **the host app** (it was "room host", "room service" and "LAN server").
  - Players add a **game**, not a cartridge or ROM.
  - Rooms have **spots**, not seats.
  - N64 and Trade & link are **Beta** (they were "Experimental").
  - In Trade & link it's **you** and **your friend**, not Console 1 and Console 2.
- **No jargon on screen:**
  - **Removed terms:** LAN, client isolation, WebRTC, core, link mode and "page focus" are gone from what players see.
  - **Internet play** reads as "Far apart? You can both join a free app like Tailscale."
  - **Game controllers** that need HTTPS read as "your friend's host app needs its security certificate set up".
  - **Errors** say what to do: "This system needs a one-time setup on the host computer…", "That room isn't open anymore. Ask your friend for a new invite.", "You were away too long, so your spot was given up. Join again."
- **Connection chip:** it reads "Great / OK / Weak connection"; frames per second and delay stay in its tooltip.
- **Buttons:** Turn on sound, Mute, Full screen, Add game, Download my save, Start, Finish.
- **Tests:** strings pinned by tests were updated: roster states, room summary ("1 of 4 players · 3 spots open"), link validation errors and GBA link messages.

**Regression:** full `npm test`, lint (0 errors), and the in-repo online browser test (NES room and Game Boy link, Chromium and Firefox guests, 14/14).

## Menus, settings and Downloads ROM audit (October 7)

The full findings, fixes and open items are in [docs/plans/audit-menus-roms.md](../docs/plans/audit-menus-roms.md). In short:

- **Every ROM in Downloads.** 825 zipped cartridge ROMs (GB, GBC, GBA, NES, Genesis) plus 7 N64 ROMs, 9 CHD discs and loose zips, were each loaded in the real player on the Stable channel. All 825 zips were intact, every one was detected as the right system by Add ROM, and every N64 and CD-based PlayStation game started and drew. Failures were limited to games the Stable core can't run (see the plan), and the two non-CD `.chd` files (Dreamcast, DVD) are now refused with a reason.
- **Every Settings control.** 49 checks drove each control in the built app: state, DOM effect, storage, persistence across reload, the section rail, downloads, and the hidden-samples count.
- **Devices.** 11 viewports (desktop 1920, laptops, Chromebooks with touch, tablets, phones in both orientations) on 8 routes: no horizontal overflow, 44 px touch targets, 11 px minimum text.
- **Edge cases.** Malformed routes, hostile search and edit text, throwing storage, a slow library, bad player parameters, and truncated, empty and garbage uploads.

`npm --prefix retrooasis run test:roms -- "<folder of system folders>" [--limit N] [--concurrency N] [--channel nightly]` repeats the ROM check on your own collection. It serves the folder read-only on loopback, boots each game in the real player and reports ok, blank or failed. It needs a build and Playwright, like `test:online-browser`.

`npm --prefix retrooasis run test:threads` serves the build with no isolation headers and checks that a PSP core still starts (the service worker adds them), plus the no-service-worker message. It needs Playwright and a network connection.

`npm run test:lan` also checks the invite-address list against Windows, macOS and Linux style adapter sets, and that the room host picks up an address that appears or disappears after it started.

New unit checks in `npm test`: CHD media detection, folder names in the Libretro / No-Intro style, damaged-archive detection, size guards for unreadable archives, router decoding and case, and edited-field merging.

## Cover art and offline cores (October 8)

Covers: a name-matching sweep over 825 real file names against the Libretro listings, plus a browser run against a fake thumbnail host (slow, corrupt, dropped, redirected, rate-limited, offline and 150-tile lazy loading). The cover browser suite now has 36 checks, including offline placeholders and the `online` retry.

Offline cores: with the CDN blocked, every core that had been played online started again from its saved copy, including PSP (through the worker's copy of `ppsspp-assets.zip`, since EmulatorJS discards its own). A damaged core download (truncated, or a captive-portal page) is recovered by **Try again**, which forgets the saved cores first. The local channel needs no internet for the cores that `data/cores` contains. To repeat this by hand: play a game for each system online, block `cdn.emulatorjs.org` (DevTools → Network → block request domain), reload the player page and check that it starts and draws. `npm run test:covers` covers the worker's PSP pack copy and its survival across updates and activation.

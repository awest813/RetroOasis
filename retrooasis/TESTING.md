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
| `npm --prefix retrooasis run test:link` | Trade & link: cartridge/save validation, GBA protocol choice, cartridge transfer framing, zipped ROMs; with built link cores (`npm run oasis:lan:link`) also GB↔GBC cable exchange through SameBoy boot ROMs and GBA per-console input/save round trips on the real WASM cores |
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

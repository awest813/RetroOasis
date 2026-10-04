# N64 GBC and GBA multiplayer plan

Audit and implementation date: 2026-10-03. Status: shared room foundation and experimental N64 hosting implemented; GB/GBC and GBA core feasibility prototypes built and tested. Handheld linked-session UI and real multiplayer gameplay acceptance remain pending.

Extend RetroOasis multiplayer on the same Wi-Fi/LAN in three stages: N64 shared-console play, GB/GBC link play, then GBA link play. Keep emulation on the host and use WebRTC for guest video, audio, and controls. N64 can extend the existing room architecture. The handheld systems require multiple emulated consoles and a working emulated link cable on the host.

## Implementation evidence

| Area | Completed | Remaining acceptance |
| --- | --- | --- |
| Shared foundation | Protocol v2, one browser/server capability module, server-owned slots, per-guest reservations, four-player N64 capacity, core/profile-specific input validation and neutral release. | Physical LAN devices, background recovery and sustained performance. |
| N64 | Pinned local Mupen64Plus-Next/ParaLLEl assets, digest/report preflight, required WebGL2, non-threaded local launch, analog/Z/C controls, two/four-player room option. | Independent in-game controls for all four ports, actual multiplayer mode and 20-minute hardware test. |
| N64 browser evidence | Pokémon Stadium 2 renders and its real video/audio tracks reach a guest. A four-player WebRTC fixture routes independent Player 2–4 inputs; Z/C/axes release and reconnect restore the correct port. | Fixture routing and a rendered stream do not certify multiplayer gameplay or audible audio on another device. |
| Core report fix | EmulatorJS now decodes cached report envelopes instead of discarding them. This preserves build identifiers and rendering defaults; the modern N64 core loads successfully. | Regression tests cover both cached and direct report formats. |
| GB/GBC | SameBoy 1.0.3 WASM runs two linked consoles; original test cartridges exchange serial data in both directions for DMG and CGB. Distinct battery saves export and reload into fresh instances. Both Node and browser frame-scheduled tests pass. | Product player, cartridge/boot loading, audio, real link games, save UI and lifecycle recovery. |
| GBA | Pinned gpSP interpreter WASM boots two isolated Advance Wars USA instances and routes its netpacket callbacks locally. Node: 361 sent / 359 delivered over 180 frames. Browser: 5,580 frames each, 11,222 / 11,220 packets, both screens and audio callbacks; synchronized pause. | A completed link match, target-speed pacing/audio playback, lifecycle and save persistence. No general GBA cable support is claimed. |

Reproduction and source pins are in [the handheld prototype README](../../retrooasis/scripts/handheld/README.md). Build outputs, source checkouts and the local SDK are ignored. No commercial ROMs or BIOS files are committed. Protocol tests, the production build and lint pass; physical-device and sustained gameplay gates below still apply.

The gpSP frontend input bridge is also checked independently: Node observes Start only in the selected core and then a neutral release; the browser recorded 144 pressed input polls for Console 1 and zero for Console 2. This verifies core callback isolation, not a completed linked game. The browser pacing numbers were collected alongside the N64 audit, so they are feasibility evidence rather than a hardware benchmark.

## Initial audit findings

| Finding in this checkout | Consequence | Required change |
| --- | --- | --- |
| `src/lib/lan.ts`, `scripts/lan-rooms.mjs`, and `/api/lan` each list NES, SNES, and Mega Drive independently. | Adding a system in one place can make the UI disagree with the server. | Introduce a shared, versioned capability description and verify it at the player and server. |
| Rooms expose `maxPlayers: 2`, assign every new guest slot 1, and reserve one reconnecting guest. | Three guests cannot join an N64 game. | Allocate distinct slots from a server-owned per-room capacity; preserve each guest's reservation. |
| `public/lan-shared.js` accepts only digital button indices 0–11. | N64 Z, analog stick, and C-buttons are rejected or absent. | Add validated N64 digital buttons and analog axes with a versioned input profile. |
| `public/lan-guest.js` uses a 12-button layout and converts gamepad stick motion to digital directions. | N64 movement would lose analog precision, and labels would be wrong. | Add system-specific touch, keyboard, and gamepad mappings. |
| `public/lan-host.js` blocks all local players except Player 1 and initially clears only slot 1, indices 0–11. | N64 slots and axes can retain stale input; all additional local controllers are excluded. | Define slot ownership and clear every input in the relevant profile on room creation, pause, loss, removal, and exit. |
| Host capture is a single canvas at 30 fps with audio taken from the active core. | N64 GPU capture and performance are unverified; linked handhelds need multiple displays. | Test N64 capture with real gameplay and add a host adapter for linked sessions. |
| `scripts/prepare-lan.mjs` prepares only the existing console cores. No N64, GB/GBC, or GBA core assets are currently installed in `data/cores`. | Local hosting cannot launch these new modes yet. | Prepare and pin the needed core builds and reports, with a preflight check before starting a room. |
| LAN launch forces non-threaded local cores. | That policy has not been validated for the proposed N64 or handheld builds. | Select thread/render requirements from the tested build profile and fail clearly when requirements are unavailable. |
| `.gbc` files resolve to the existing `gb` system and Gambatte; `.gba` resolves to mGBA. The inspected GameManager bindings expose no subsystem or serial-link API. | Current single-console loading cannot initialize two linked handhelds. | Keep normal playback working; add a separate linked-session loader and runtime. |
| EmulatorJS's bundled `data/src/netplay.js` freezes guest emulation and displays a host stream. | Its netplay menu does not establish handheld serial-link support. | Prove actual in-game link communication before exposing handheld hosting. |

This table records the starting checkout. The foundation and N64 changes above resolve its shared-room findings. It is not a device compatibility report.

## Core feasibility

| System | Proposed implementation | Evidence and remaining uncertainty |
| --- | --- | --- |
| N64 | One Mupen64Plus-Next instance on the host; guests control separate ports and receive the same game screen. | [Libretro documents four controller ports](https://docs.libretro.com/library/mupen64plus/). This checkout already maps N64 controls in EmulatorJS. The actual browser build still needs capture, audio, and performance tests. |
| GB/GBC | SameBoy 1.0.3 running two linked consoles on the host. The prototype directly wraps its core API, so it does not depend on EmulatorJS subsystem loading. | [SameBoy documents linked modes and separate saves](https://docs.libretro.com/library/sameboy/). A compatible WASM build, actual serial exchange and separate battery reloads now pass. Browser session integration and real gameplay remain unproven. |
| GB/GBC alternatives | Evaluate Gearboy and TGB Dual against the SameBoy prototype before selecting a build. | [Gearboy documents two linked consoles, subsystem loading, and separate saves](https://docs.libretro.com/library/gearboy/). [TGB Dual documents linked GB/GBC units and two controller ports](https://docs.libretro.com/library/tgb_dual/). Their exact WASM builds and frontend behavior need proof. |
| GBA first candidate | Investigate a pinned gpSP build and a frontend bridge for its Libretro netpacket callbacks. Prefer two host-side instances connected locally if feasible. | Current [gpSP options](https://raw.githubusercontent.com/libretro/gpsp/master/libretro/libretro_core_options.h) include wireless-adapter mode and specific cable modes for Pokémon Gen 3 and Advance Wars 1/2. Its [frontend source](https://raw.githubusercontent.com/libretro/gpsp/master/libretro/libretro.c) routes these through netpacket callbacks. This is evidence for those modes, not generic GBA cable compatibility or browser readiness. |
| GBA fallback | Prototype a custom mGBA WASM host runtime coordinating two consoles locally; stream the second console to its guest. | The [current Libretro mGBA documentation](https://docs.libretro.com/library/mgba/) lists no netplay or subsystem support. Upstream [mGBA serial lockstep code](https://raw.githubusercontent.com/mgba-emu/mgba/master/include/mgba/internal/gba/sio/lockstep.h) provides a development starting point, not a ready EmulatorJS integration. |

Gambatte is the current GB/GBC core; its [documented frontend features](https://docs.libretro.com/library/gambatte/) do not establish a linked dual-console mode. Adding `gb` or `gba` to the room allowlist alone would expose a feature that cannot provide the intended multiplayer behavior.

The proposed architecture keeps serial-link coordination inside the host. Network delays affect guest controls and video rather than carrying each emulated cable transaction across Wi-Fi. This is an engineering choice that still requires prototype validation. GBA timing, threading, packaging, and frontend callback support are the largest unknowns. The inspected JavaScript frontend exposes no netpacket bridge; absence of a ready bridge must not be confused with absence of upstream emulator support.

## Shared room and input foundation

1. Define capabilities by system and mode: `shared-console` or `linked-handheld`, tested core build, maximum players, input profile, display layout, and required browser features. Keep normal GB/GBC catalog IDs compatible; choose the link core only for a linked session.
2. Add a protocol version and explicit input-profile identifier to room negotiation. Reject incompatible clients with an update message. Retain the existing digital protocol during migration or reject old cached clients explicitly.
3. Use complete input snapshots with sequence numbers. For N64, transmit digital buttons plus normalized stick X/Y; validate finite values and ranges. Translate to EmulatorJS directional axis indices only on the host. Never accept a guest-selected controller slot or emulator command.
4. N64 digital mapping in this checkout is A=0, B=1, Start=3, D-pad=4–7, L=10, R=11, Z=12. Stick directions use 16–19; C directions use 20–23. EmulatorJS scales analog values to `0x7fff`; verify sign, range, and C-button behavior against the selected core before shipping.
5. Apply a radial dead zone, calibrated stick range, and neutral release for focus loss or controller disconnect. Keyboard and touch must provide N64 stick movement, D-pad, four C-buttons, Z, L/R, A/B, and Start. Handheld profiles need only their actual controls.
6. Generalize slot allocation, ownership, reconnection reservations, kick, capacity, and cleanup. Initially keep the host in slot 0 and dedicate remaining room slots to guests. Local couch-controller mixing can follow after explicit ownership rules are implemented.
7. Preserve packet-size limits, replay rejection, host-only actions, LAN address checks, and input watchdogs. Test analog release as well as button release. Measure buffering before changing the current ordered data channel; stale queued snapshots must not reapply held controls after a recovery.

## Delivery stages

### Stage 1 N64 with two players

Prepare a pinned local Mupen64Plus-Next build and add a preflight for core/report availability, canvas capture, audio capture, and its actual rendering/thread requirements. Build the N64 input profile and controls, then enable experimental N64 hosting after an end-to-end proof.

Use `Pokemon Stadium 2 (USA).z64` from Downloads to enter a multiplayer mode and demonstrate independent Player 1 and Player 2 inputs. Use the existing Ocarina of Time ROM only as a single-player loading and graphics check. Neither game name nor platform support alone establishes multiplayer compatibility.

Pass criteria: a real game streams without a black/frozen canvas; guest analog motion, Z, and every C-button reach the correct port; audio works; pause, removal, reconnect, and host exit release all inputs; local saves still work. Record host hardware, browser versions, core build, emulation speed, stream frame rate, RTT, and dropped frames during a 20-minute session. The 30 fps stream is separate from the game's own emulation speed.

### Stage 2 N64 with four players

Raise capacity to four for N64 only. Allocate slots 1–3 independently, retain reservations per guest, and send offers and candidate messages to the correct peer. Test three streams without guest-to-guest signaling or slot theft.

Pass criteria: four players control distinct ports in an appropriate game; removing or reconnecting one guest does not disrupt others; a fifth player is rejected; performance remains usable on the documented host. Keep a two-player setting for hosts that cannot sustain three video encoders. Four-player support stays experimental until tested on separate LAN devices.

### Stage 3 GB and GBC linked sessions

The local SameBoy WASM proof now passes serial and separate battery-save tests for GB and GBC. Continue with a separate linked-session player using the direct two-console core wrapper, rather than relying on unsupported EmulatorJS subsystem bindings. Validate per-console controls, browser pacing, video and audio, and load two selected cartridges/boot assets. The original fixture boot stub must not be used for library games.

Add a linked-session setup screen where the host selects each cartridge and its initial save. Default the guest view to Player 2's screen, while allowing a combined display for cooperative games. Implement canvas cropping/composition based on the tested core layout; provide explicit audio selection. A streamed second screen must correspond to an actual second console.

Use separate storage keys for system, ROM digest, session mode, and console slot. Back up imported battery saves before a session. Provide per-player export of updated saves; never overwrite the original library save silently. If the core uses a combined save container, split/import it only after its format is verified.

Pass criteria: an actual multiplayer game links reliably; each player controls their own console; different existing saves survive export and reload; room loss and pause cannot leave the emulated cable stuck. Test trading separately before claiming Pokémon trade support. No GB/GBC ROM was found in Downloads during this audit; a suitable supplied ROM or link-test homebrew is required for gameplay acceptance.

### Stage 4 GBA link runtime prototype

First prototype gpSP's Advance Wars 1 mode with `Advance Wars (USA).gba` from Downloads. Pin the exact source revision containing that mode, establish an interpreter/WASM build, and implement the required netpacket start/stop/send/receive/poll and membership callbacks in the frontend wrapper. Two host-side instances need isolated memory/state and a local packet router with core-compatible ordering and polling. Confirm that this can run without blocking or starving the browser before exposing a room action. Keep the exact game/mode allowlist tied to passed gameplay tests.

If gpSP cannot satisfy the required games or host runtime, investigate two mGBA instances connected through its local serial coordinator. Establish whether the WASM wrapper can support upstream synchronization and threading; do not assume one worker per console or independent animation loops will preserve cable timing. Expose lifecycle, per-console input/video/audio, battery-save import/export, and pause APIs behind the same host adapter used by GB/GBC.

Start timing tests with suitable link-test homebrew, then exercise compatible two-cartridge games. Validate the Downloads GBA titles' exact multiplayer requirements before choosing additional acceptance games. `Super Puzzle Fighter II` is already verified for ordinary local playback, which is not evidence of a working link. Single-cartridge multiboot, wireless-adapter modes, and four linked GBAs are separate milestones with their own support and tests. If a later design uses one emulator on each device for gpSP netpacket mode, it needs a separate guest ROM/save workflow and latency test; it cannot silently reuse today's streaming-only guest.

Pass criteria: repeatable serial exchanges without stalls, independent controls/screens, synchronized pause/resume, safe save persistence, and a successful real multiplayer session. If a browser build cannot pass these checks, keep GBA link play unavailable and document the failing requirement. A native helper would be a separate architecture decision, not an automatic replacement for browser hosting.

### Stage 5 Product and release audit

Update game-detail actions, Settings guidance, join instructions, core preparation, and documentation from the capability description. Use explicit labels such as N64 multiplayer and Game Boy link play. Handheld setup must explain that both consoles run on the host and that saves belong to individual players.

Extend protocol tests for capacity, slot isolation, analog bounds, neutral release, malformed inputs, reconnect credentials, and version mismatch. Add browser checks for each tested adapter. Retest existing NES/SNES/Mega Drive rooms after every shared protocol change.

Test desktop and mobile guests on two physical LAN devices, including trusted HTTPS for gamepads, background/foreground transitions, packet loss, and host-server restart. Preserve local play and saves on ordinary static hosting. Ship only capabilities that have passed their own gameplay and save checks.

## Remaining delivery order

The serial/trade audit added bounded lifecycle APIs and tests for real 64-byte
GB/GBC cable transfers, internal/external clock reversal, fast GBC timing, cable
removal, and a pause in the middle of a byte. Save imports are allowed only during
session setup and reject null or incorrectly sized buffers without changing the
current battery data. A save export is a battery snapshot; it is not a transaction
receipt for a completed trade. Per-cartridge identity, pre-trade backups, per-player
save UI and an actual Pokémon trade remain required product work.

The Advance Wars prototype now rejects other cartridges, tracks membership
idempotently, guards stopped/self/invalid packet deliveries, and exposes a
synchronized pause. Browser pacing follows GBA hardware timing on both consoles,
caps catch-up work and discards background elapsed time. This proves neither
Pokémon Gen 3 trading nor generic GBA cable compatibility.

N64 touch taps now survive several emulation frames; cancellation/focus loss
clears pending timers immediately. Paused snapshots consume sequence numbers
without applying inputs, preventing their replay after resume. The pause label
also follows the emulator's own pause control. Two players remain the default
even when a room-create request omits capacity. Four-player selection is explicit.
The repeatable `scripts/test-n64-browser.mjs` fixture adds raw per-port controls
and frame/input traces to the real player without changing the supplied cartridge.
Pokémon Stadium 2 now has a real two-player setup check: guest A changes COM to
2P in its mini-game screen, and Pichu's Power Plant runs to a result with both
players selected. Variable guest stick values and neutral release reached raw
port 1. Full analog/C/Z gameplay and physical four-player acceptance remain open.

Finish N64 real multiplayer and physical-device acceptance first. Then integrate the passing GB/GBC core prototype into a linked-session host adapter with explicit per-console saves and a gameplay test. Keep GBA behind its Advance Wars gameplay and browser scheduling gates before building its room UI. Do not promise generic GBA link support from successful packet routing alone.

The shared files, room server, preparation/preflight, player/detail/settings setup and protocol tests have been changed together. GB/GBC and GBA remain outside the room allowlist until their linked-session adapter and acceptance requirements are satisfied. Their normal single-console playback continues through the existing Gambatte and mGBA paths.

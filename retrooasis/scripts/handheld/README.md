# Handheld link feasibility prototypes

These wrappers prove core behavior before integrating a linked-session player.
They are separate from normal EmulatorJS playback and are not exposed in LAN rooms.
Build outputs, source checkouts and the compiler stay in the ignored
`retrooasis/.handheld-cache/` directory. No commercial ROM or BIOS is included.

## Reproduce

Use the official Emscripten SDK **3.1.74** in `.handheld-cache/emsdk` and activate
it locally. Do not use permanent/system activation. On Windows:

```powershell
git clone https://github.com/emscripten-core/emsdk.git retrooasis/.handheld-cache/emsdk
python retrooasis/.handheld-cache/emsdk/emsdk.py install 3.1.74
python retrooasis/.handheld-cache/emsdk/emsdk.py activate 3.1.74
git clone --branch v1.0.3 https://github.com/LIJI32/SameBoy.git retrooasis/.handheld-cache/SameBoy
git clone https://github.com/libretro/gpsp.git retrooasis/.handheld-cache/gpsp
git -C retrooasis/.handheld-cache/gpsp checkout 5819380c2ffb0900219d700a382ee68c464ebb99
node retrooasis/scripts/handheld/build-sameboy.mjs
node retrooasis/scripts/handheld/test-sameboy.mjs
node retrooasis/scripts/handheld/test-frame-clock.mjs
node retrooasis/scripts/handheld/build-gpsp.mjs
node retrooasis/scripts/handheld/test-gpsp.mjs "C:\path\to\Advance Wars (USA).gba"
node retrooasis/scripts/handheld/test-browser.mjs "C:\path\to\Advance Wars (USA).gba"
```

The build scripts verify the source revisions. SameBoy 1.0.3 is pinned to
`208ba4afabffab9edde416f2dbb8ae459e34adb8`. They use direct compiler invocations,
so GNU Make is not required. The gpSP build uses its interpreter and its upstream
open-source BIOS bytes; its source BIOS embedding assembly is represented by an
equivalent generated C array. Each gpSP module has its own memory and filesystem.

## Evidence and limits

- SameBoy: original GB/GBC cartridges complete bidirectional one-byte and
  64-byte exchanges. The block tests reverse clock ownership, pause mid-transfer,
  and check all 512 serial clocks and each received battery byte. GBC fast mode
  also completes faster than normal mode. Unplugged internal clocks read `0xff`;
  external clocks wait. Fresh reconnects clear old cable state.
  Each console writes a distinct battery save, exports it, and reloads it into a fresh instance.
  Save imports require exact sizes and a loaded cartridge, and are refused after
  either console starts stepping. Invalid imports leave battery data untouched.
  This prevents replacing save data underneath an active trade; it does not
  validate a game's save format or prove a completed Pokémon trade.
  The boot stub is for this test only; it is not a replacement BIOS for library games.
- gpSP: two isolated WASM instances boot the supplied Advance Wars USA cartridge
  (`AWRE`), render video/audio, register netpacket membership, and route packets
  locally. Node tests also verify that Start reaches only the selected core's
  input callback and that release is observed. The browser records isolated
  pressed-input polls. Duplicate connect/disconnect, repeated close, synchronized
  pause and invalid cartridge checks pass. This does not prove
  a completed multiplayer match or generic GBA cable
  support. The wrapper selects `mul_aw1` only.
- GB/GBC single-byte, block-transfer and save checks pass in browser WASM.
  GBA uses paired hardware-frame pacing (approximately 59.73 Hz), rather than one
  emulated frame per display refresh. Clock tests give identical counts at
  30/60/120/144 Hz, cap catch-up at four paired frames, and discard paused/background
  time. Both consoles paused/resumed together in the browser; only Console 1
  recorded pressed input (156 / 0). The audit reached 22,681 frames each with
  45,615 / 45,613 routed packets and two pending. Maximum observed batch time was
  49.9 ms while N64 ran alongside it; this is not a device performance certification.
  Audio playback, gameplay, game-level reconnect recovery and linked-session save
  UI still require acceptance tests.
  The optional browser fixture binds to loopback and serves only the prototype
  modules and the explicitly supplied AWRE cartridge. Open its printed URL to
  test GB/GBC serial and saves, then run two GBA screens with per-console inputs
  and synchronized pause. Pointer controls support holds and minimum-duration
  taps; cancellation, focus loss and pause clear pending releases. It reports
  frame steps and local packet delivery.
  Audio callbacks are counted; audio playback and completed link gameplay remain
  separate acceptance gates. Omitting the ROM path leaves its GBA action disabled.
  These checks are deliberately excluded from `npm test`, since they require a local
  compiler/source cache and, for GBA, a supplied ROM.

These wrappers now ship in the experimental **Trade & link** rooms. `npm run oasis:lan:link`
(`scripts/prepare-link.mjs`) reproduces everything above without GNU Make. It also assembles
SameBoy's own MIT boot ROMs with RGBDS 0.9.1, so library cartridges boot through real boot
ROMs rather than the fixture stub. The bundle is written to `.handheld-cache/link/` with a
checksum manifest. Since the prototypes, the wrappers gained a hardware model per console
(GB ↔ GBC links), audio capture, RAM-only/RTC save imports (SameBoy), and for gpSP a
selectable link mode, generic cartridges (header check instead of the AWRE gate), and save
import/export. `scripts/test-link.mjs` covers them with original fixture cartridges, including
a homebrew GBA ROM (`gbaCartridge`) that draws, counts boots in SRAM and records KEYINPUT.
Real Pokémon trades and an Advance Wars match remain the gameplay acceptance gates.

# External References

Curated upstream projects RetroOasis may borrow from when improving system detection, launch lifecycle, archive extraction, or metadata. This is a planning and attribution guide — not an endorsement to vendor code without checking each project's license.

| Project | License | What to borrow | Fit for RetroOasis |
| --- | --- | --- | --- |
| [libretro-database](https://github.com/libretro/libretro-database) | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) | ROM fingerprints (No-Intro / Redump style datfiles), playlists (`.lpl`), and system-detection heuristics | Usable with attribution; **not MIT**. Good for import-time system hints and playlist import — any derived dataset must stay CC-BY-SA-4.0. |
| [libretro-core-info](https://github.com/libretro/libretro-core-info) | Mixed (per-core; see each `*_libretro.info`) | Authoritative `supported_extensions` and core metadata (e.g. Azahar: `3dsx`, `axf`, `zcci`) | Best source for keeping [`src/systems.ts`](../src/systems.ts) extension lists aligned with upstream RetroArch. Submit changes to [libretro-super](https://github.com/libretro/libretro-super) instead of the mirror. |
| [Nostalgist.js](https://github.com/arianrhodsandlot/nostalgist) | MIT | Clean programmatic RetroArch launch API, core prefetch, `retroarchCoreConfig` wiring | Good patterns for launch lifecycle in [`src/emulator.ts`](../src/emulator.ts) and [`src/coreCdn.ts`](../src/coreCdn.ts). Does **not** ship PPSSPP, Azahar, or Flycast — 2D/light cores only. |
| [webretro](https://github.com/BinBashBanana/webretro) | MIT | RetroArch-in-browser shell, import URLs, UI/launch affordances | Useful for UI and deep-link ideas; already partially mirrored via `WEBRETRO_CORE_TO_SYSTEM_ID` in `systems.ts`. Last updated 2023; still no threaded 3DS/PSP story like EmulatorJS nightly. |
| [filing](https://github.com/xlianghang/filing) | MIT (wrapper); [libarchive](https://www.libarchive.org/) is BSD-like | Browser + worker extraction for zip/7z/rar via libarchive WASM | Best candidate for stronger 7z/RAR support in [`src/archive.ts`](../src/archive.ts). Useful for Dreamcast GDI sets shipped in `.7z`. |

## libretro-database

- **Repository:** https://github.com/libretro/libretro-database
- **License:** [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- **RetroOasis touchpoints:** import pipeline, future playlist (`.lpl`) support, ROM fingerprinting for auto system detection, cover-art filename normalization (No-Intro naming already used by [`src/coverArt.ts`](../src/coverArt.ts)).

**Compliance:** CC-BY-SA-4.0 requires attribution and ShareAlike on adapted works. Do not merge datfile contents into the MIT-licensed app bundle without a separate attribution file and license notice. Prefer runtime fetch + cache, or a clearly labeled CC-BY-SA data artifact.

## libretro-core-info

- **Repository:** https://github.com/libretro/libretro-core-info (mirror; submit patches to [libretro-super `dist/info/`](https://github.com/libretro/libretro-super/tree/master/dist/info))
- **License:** Mixed — each `*_libretro.info` file lists its core license (often GPLv2+).
- **RetroOasis touchpoints:** [`src/systems.ts`](../src/systems.ts) `extensions` arrays, experimental core routing (3DS Azahar, Dreamcast Flycast, PSP PPSSPP).

When adding or updating a system, cross-check the matching `*_libretro.info` `supported_extensions` field before changing RetroOasis import rules.

## Nostalgist.js

- **Repository:** https://github.com/arianrhodsandlot/nostalgist
- **Docs:** https://nostalgist.js.org/apis
- **License:** MIT
- **RetroOasis touchpoints:** [`src/emulator.ts`](../src/emulator.ts) (launch orchestration, `EJS_*` wiring), [`src/coreCdn.ts`](../src/coreCdn.ts) (prefetch / warm-cache patterns).

Borrow API shape and lifecycle hooks (`beforeLaunch`, `retroarchCoreConfig`, resolve helpers), not the core binaries — Nostalgist targets lightweight libretro Emscripten builds from the official buildbot, not EmulatorJS nightly threaded cores.

## webretro

- **Repository:** https://github.com/BinBashBanana/webretro
- **Demo:** https://binbashbanana.github.io/webretro/
- **License:** MIT
- **RetroOasis touchpoints:** [`src/systems.ts`](../src/systems.ts) (`WEBRETRO_CORE_TO_SYSTEM_ID`), import URL compatibility mentioned in [README](../README.md).

Useful reference for player-facing shell UX and `?core=` / `?rom=` style deep links. RetroOasis already exceeds webretro on heavy 3D systems via EmulatorJS nightly + cross-origin isolation.

## filing

- **Repository:** https://github.com/xlianghang/filing
- **License:** MIT (JavaScript wrapper); underlying libarchive is BSD-like
- **RetroOasis touchpoints:** [`src/archive.ts`](../src/archive.ts), [`data/compression/`](../data/compression/) (current libunrar-js + legacy 7z worker).

Stronger unified 7z/RAR path than the vendored libunrar worker alone — especially multi-volume and solid 7z archives common in Dreamcast GDI packs. Evaluate worker offload, WASM size, and iOS memory limits before replacing the current extraction stack.

## Related in-repo references

| Area | Current upstream / pattern |
| --- | --- |
| Cover art filenames | [libretro-thumbnails](https://github.com/libretro-thumbnails) naming convention in `coverArt.ts` |
| Archive extraction (today) | `fflate` (ZIP/GZIP), vendored `libunrar-js`, legacy `extract7z` worker — see [`data/compression/README.md`](../data/compression/README.md) |
| Emulation runtime | [EmulatorJS](https://emulatorjs.org/) vendored under `data/` |
| EmulatorJS upstream sync | [README — EmulatorJS Upstream Sync](../README.md#emulatorjs-upstream-sync) |

# External References

Curated upstream projects RetroOasis may borrow from when improving system detection, launch lifecycle, archive extraction, or metadata. This is a planning and attribution guide — not an endorsement to vendor code without checking each project's license.

| Project | License | What to borrow | Fit for RetroOasis |
| --- | --- | --- | --- |
| [libretro-database](https://github.com/libretro/libretro-database) | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) | ROM fingerprints (No-Intro / Redump style datfiles), playlists (`.lpl`), and system-detection heuristics | Usable with attribution; **not MIT**. Good for import-time system hints and playlist import — any derived dataset must stay CC-BY-SA-4.0. |
| [libretro-core-info](https://github.com/libretro/libretro-core-info) | Mixed (per-core; see each `*_libretro.info`) | Authoritative `supported_extensions` and core metadata (e.g. Azahar: `3dsx`, `axf`, `zcci`) | Best source for keeping [`src/systems.ts`](../src/systems.ts) extension lists aligned with upstream RetroArch. Submit changes to [libretro-super](https://github.com/libretro/libretro-super) instead of the mirror. |
| [Nostalgist.js](https://github.com/arianrhodsandlot/nostalgist) | MIT | Clean programmatic RetroArch launch API, core prefetch, `retroarchCoreConfig` wiring | Good patterns for launch lifecycle in [`src/emulator.ts`](../src/emulator.ts) and [`src/coreCdn.ts`](../src/coreCdn.ts). Does **not** ship PPSSPP, Azahar, or Flycast — 2D/light cores only. |
| [webretro](https://github.com/BinBashBanana/webretro) | MIT | RetroArch-in-browser shell, import URLs, UI/launch affordances | Useful for UI and deep-link ideas; already partially mirrored via `WEBRETRO_CORE_TO_SYSTEM_ID` in `systems.ts`. Last updated 2023; still no threaded 3DS/PSP story like EmulatorJS nightly. |
| [filing](https://github.com/xlianghang/filing) | MIT (wrapper); [libarchive](https://www.libarchive.org/) is BSD-like | Browser + worker extraction for zip/7z/rar via libarchive WASM | Best candidate for stronger 7z/RAR support in [`src/archive.ts`](../src/archive.ts). Useful for Dreamcast GDI sets shipped in `.7z`. |
| [@sinedied/mini-scraper](https://github.com/sinedied/mini-scraper) | MIT | Libretro thumbnail scrape with no API key; region preferences (World, Europe, USA, Japan); optional Ollama fallback | Closest TypeScript/browser-adjacent fit to [`src/coverArt.ts`](../src/coverArt.ts) — borrow region priority and boxart → title → snap ordering. |
| [libretro-image-matching-server](https://github.com/josegonzalez/libretro-image-matching-server) | MIT | Fuzzy ROM filename → Libretro thumbnail URL matching (Python/FastAPI) | Server-side reference that validates RetroOasis `diceCoefficient` + variant logic; useful if you add a self-hosted matcher or bulk pre-index. |
| [rascraper](https://github.com/mattsteen14/rascraper) | MIT | Exact Libretro filename → box/preview download | Simple exact-match pipeline reference. |
| [RetroScraper](https://github.com/laurorual/RetroScraper) | MIT | LaunchBox metadata + box/screenshot/marquee pipeline | Broader metadata + multi-art-type scraper reference. |
| [scrappy](https://github.com/saitamasahil/scrappy) | MIT | Skyscraper-style XML mixes, multi-output artwork | Multi-output / mix-file artwork workflow reference. |
| [minui-artwork-scraper-pak](https://github.com/josegonzalez/minui-artwork-scraper-pak) | MIT | End-to-end scan ROMs → match → cache → download | Orchestration reference; uses libretro-image-matching-server internally. |

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

## Cover art and ROM matching

RetroOasis already implements Libretro thumbnail lookup, filename normalization, and `diceCoefficient` scoring in [`src/coverArt.ts`](../src/coverArt.ts). These upstream projects are reference implementations for improving match quality, region preference, and bulk workflows.

### Best fit for RetroOasis (TypeScript, browser-adjacent)

#### @sinedied/mini-scraper

- **Repository:** https://github.com/sinedied/mini-scraper
- **License:** MIT
- **Stack:** TypeScript CLI
- **RetroOasis touchpoints:** [`src/coverArt.ts`](../src/coverArt.ts) (`LibretroCoverArtProvider`, `cleanRomNameForLibretro`, region variants).

Scrapes Libretro thumbnails with no API key. Supports region preferences (World, Europe, USA, Japan) and optional Ollama fallback when filename match fails. Closest upstream to what RetroOasis already does — **borrowed in code:** `libretroFilenameVariants()`, `LIBRETRO_REGION_PREFERENCE`, and boxart → title → snap ordering in `LibretroCoverArtProvider`.

### Best fit for fuzzy ROM → image matching (server-side reference)

#### libretro-image-matching-server

- **Repository:** https://github.com/josegonzalez/libretro-image-matching-server
- **License:** MIT
- **Stack:** Python / FastAPI
- **RetroOasis touchpoints:** [`src/coverArt.ts`](../src/coverArt.ts) (`diceCoefficient`, filename variant expansion).

Fuzzy-matches ROM filenames to Libretro thumbnail URLs. Used by [minui-artwork-scraper-pak](https://github.com/josegonzalez/minui-artwork-scraper-pak). Good reference for validating the in-browser Dice-coefficient approach, or for a future self-hosted matcher / bulk pre-index service behind Connections.

### Good reference scrapers (not TypeScript, but MIT logic)

| Project | License | Helps with |
| --- | --- | --- |
| [mattsteen14/rascraper](https://github.com/mattsteen14/rascraper) | MIT | Exact Libretro filename → box/preview download |
| [laurorual/RetroScraper](https://github.com/laurorual/RetroScraper) | MIT | LaunchBox metadata + box/screenshot/marquee pipeline |
| [saitamasahil/scrappy](https://github.com/saitamasahil/scrappy) | MIT | Skyscraper-style XML mixes, multi-output artwork |
| [josegonzalez/minui-artwork-scraper-pak](https://github.com/josegonzalez/minui-artwork-scraper-pak) | MIT | End-to-end scan ROMs → match → cache → download |

These are not drop-in browser dependencies, but their matching heuristics, cache layout, and orchestration patterns are worth reading before extending RetroOasis cover-art providers or adding a bulk import-time artwork pass.

## Related in-repo references

| Area | Current upstream / pattern |
| --- | --- |
| Cover art filenames | [libretro-thumbnails](https://github.com/libretro-thumbnails) naming convention in `coverArt.ts` |
| Cover art matching references | mini-scraper (region priority), libretro-image-matching-server (fuzzy match validation) — see Cover art section above |
| Archive extraction (today) | `fflate` (ZIP/GZIP), vendored `libunrar-js`, legacy `extract7z` worker — see [`data/compression/README.md`](../data/compression/README.md) |
| Emulation runtime | [EmulatorJS](https://emulatorjs.org/) vendored under `data/` |
| EmulatorJS upstream sync | [README — EmulatorJS Upstream Sync](../README.md#emulatorjs-upstream-sync) |

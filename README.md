# RetroOasis

![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)
![Vite](https://img.shields.io/badge/built%20with-Vite-646CFF.svg)
![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6.svg)
![Node](https://img.shields.io/badge/node-18%2B-339933.svg)

RetroOasis is a self-hostable retro game library and browser emulator frontend built with TypeScript, Vite, and vendored [EmulatorJS](https://emulatorjs.org/) runtime assets. It runs as a static web app, keeps user content local by default, and focuses on the things that make browser emulation pleasant to use every day: importing, organizing, launching, saving, syncing, and recovering games with as little ceremony as possible.

Bring your own legally obtained ROMs, disc images, BIOS files, and account credentials. RetroOasis does not provide copyrighted games or proprietary BIOS files.

## Highlights

- Drag-and-drop ROM import with archive extraction and system detection
- Local IndexedDB library for games, cover art, saves, save states, BIOS files, and thumbnails
- EmulatorJS core orchestration with per-system launch checks and compatibility settings
- PSP, Dreamcast, Nintendo 64, Nintendo DS, Nintendo 3DS, PSX, DOS, arcade, Sega, Nintendo, Atari, and handheld profiles
- Save slots, automatic crash recovery, save thumbnails, and optional cloud sync
- Free cover-art discovery through Libretro thumbnails, GitHub-hosted collections, [xero/boxart](https://github.com/xero/boxart), and Wikimedia fallbacks
- Optional provider connections for RAWG, MobyGames, TheGamesDB, SteamGridDB, IGDB, ScreenScraper.fr, RetroAchievements, and cloud storage
- PWA install support, share targets, file handling, and cross-origin isolation support for threaded cores
- Experimental multiplayer and LANemu workflows

## Quick Start

```bash
git clone https://github.com/awest813/RetroOasis.git
cd RetroOasis
npm install
npm run dev
```

Open `http://localhost:5173`.

Useful commands:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build production assets |
| `npm run preview` | Preview the production build on port 4173 |
| `npm test` | Run the Vitest suite |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run lint` | Run ESLint |
| `npm run doctor` | Check common environment and hosting issues |

## Supported Systems

System definitions live in [src/systems.ts](./src/systems.ts). Current profiles include:

- Sony: PlayStation 1, PlayStation Portable
- Nintendo: NES, SNES, SNES bsnes, Game Boy, Game Boy Color, Game Boy Advance, Nintendo 64, Nintendo DS, Nintendo 3DS
- Sega: Master System, Game Gear, Genesis / Mega Drive, Genesis Wide, Sega CD / Mega-CD, 32X, Saturn, Dreamcast
- Arcade: FBNeo, MAME 2003+
- Computers: MS-DOS via DOSBox Pure
- Atari: 2600, 7800, Lynx
- Other: Intellivision, Neo Geo Pocket

New system work should include extension routing, core selection, BIOS expectations, performance defaults, UI copy, and tests.

## Importing Games

Games can be added through the drop zone, mobile add button, PWA file handling, share target, and compatible webretro-style URLs. The import pipeline can:

- Detect systems from extensions and prompt when a file could belong to multiple systems
- Extract ZIP, 7z, RAR, TAR, and GZIP archives
- Preserve archive files for cores that need zipped ROM sets
- Handle `.cue`, `.chd`, `.iso`, `.m3u`, `.gdi`, and multi-disc playlists where supported
- Apply IPS, BPS, and UPS patches
- Route launch hints such as `?core=parallel_n64`

For PlayStation 1, prefer `.cue` plus `.bin` or `.chd` disc images over plain `.iso`. PSX images often depend on CD-ROM XA track layout that a standalone ISO cannot represent.

## Saves, BIOS, and Cloud

Local storage is browser-owned:

| Data | Storage |
| --- | --- |
| Game library | IndexedDB |
| ROM payloads and extracted files | IndexedDB |
| Save states and thumbnails | IndexedDB |
| BIOS files | IndexedDB |
| Settings and optional credentials | localStorage |

Cloud features are opt-in. Save sync and library indexing support WebDAV / Nextcloud plus provider flows for Google Drive, Dropbox, OneDrive, pCloud, Blomp, Box, and Mega where configured.

## Cover Art and Metadata

Free sources work without an account:

- [Libretro Thumbnails](https://github.com/libretro-thumbnails)
- [ramiabraham/cover-art-collection](https://github.com/ramiabraham/cover-art-collection)
- [xero/boxart](https://github.com/xero/boxart)
- Wikimedia / Wikipedia fallbacks

Optional provider credentials can be configured in Settings > Connections:

- RAWG
- MobyGames
- TheGamesDB
- SteamGridDB
- IGDB
- ScreenScraper.fr
- RetroAchievements

Credentials are stored locally and sent directly from the browser to the selected provider.

## EmulatorJS Upstream Sync

RetroOasis vendors EmulatorJS runtime files under [data](./data), then layers its own TypeScript app, import flow, library UI, cloud sync, and testing around them.

When syncing upstream EmulatorJS work:

- Prefer small, auditable patches over wholesale replacement of `data/`
- Check whether RetroOasis already reimplemented the behavior in TypeScript
- Keep changes compatible with the local cache, save, BIOS, and import flows
- Run `node --check` on edited vendored JavaScript files
- Run `npm test` and `npm run build` before merging

Recent upstream-aligned fixes include CORS-safe Libretro cover downloads, preserved ZIP handling for arcade-style cores, large cache blob chunking, and `EJS_loadStateURL` restoration from cached file bytes.

## Cross-Origin Isolation

Threaded cores such as PPSSPP, DOSBox Pure, and Azahar need `SharedArrayBuffer`, which requires cross-origin isolation.

| Environment | Mechanism |
| --- | --- |
| Development | Vite injects COOP / COEP headers |
| Static hosting | `public/coi-serviceworker.js` adds the required headers at runtime |

Check DevTools if a threaded core fails:

```js
self.crossOriginIsolated
```

It should be `true`. See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) and [guide.md](./guide.md) for hosting notes.

## Project Map

| Area | Main files |
| --- | --- |
| App bootstrap | [src/main.ts](./src/main.ts) |
| Emulator orchestration | [src/emulator.ts](./src/emulator.ts), [data/src/emulator.js](./data/src/emulator.js) |
| System definitions | [src/systems.ts](./src/systems.ts) |
| Device and performance policy | [src/performance.ts](./src/performance.ts), [src/webglContextPolicy.ts](./src/webglContextPolicy.ts) |
| Import pipeline | [src/archive.ts](./src/archive.ts), [src/ui/screens/gameImport.ts](./src/ui/screens/gameImport.ts) |
| Library and UI | [src/library.ts](./src/library.ts), [src/ui.ts](./src/ui.ts), [src/ui](./src/ui) |
| Saves and BIOS | [src/saves.ts](./src/saves.ts), [src/saveService.ts](./src/saveService.ts), [src/bios.ts](./src/bios.ts) |
| Cover art and metadata | [src/coverArt.ts](./src/coverArt.ts), [src/freeMetadata.ts](./src/freeMetadata.ts) |
| Cloud | [src/cloudSave.ts](./src/cloudSave.ts), [src/cloudLibrary.ts](./src/cloudLibrary.ts) |
| Multiplayer | [src/multiplayer.ts](./src/multiplayer.ts), [src/netplay](./src/netplay), [src/multiplayer](./src/multiplayer) |
| Tests | [src](./src), [tests/e2e](./tests/e2e), [tests/multiplayer](./tests/multiplayer) |

For deeper context, read [docs/ARCHITECTURE_MAP.md](./docs/ARCHITECTURE_MAP.md), [docs/PLAN.md](./docs/PLAN.md), and [docs/SUPPORT_RUNBOOK.md](./docs/SUPPORT_RUNBOOK.md).

## Troubleshooting

| Symptom | First checks |
| --- | --- |
| Game will not boot | Confirm the system choice, extension, BIOS requirement, and whether the core expects zipped content |
| PSP, DOS, or 3DS fails immediately | Confirm `self.crossOriginIsolated === true` |
| PSX disc fails | Use `.cue` + `.bin` or `.chd`; verify the cue references existing files |
| Arcade game fails after import | Make sure the ZIP set was preserved and not extracted |
| Slow 3D performance | Use Performance mode, reduce internal resolution, or disable heavy post-processing |
| Import fails from archive | Try the extracted ROM directly; very large archives may exceed browser memory limits |
| Save states disappear | Check storage quota, private browsing mode, and browser cleanup settings |
| Cover art does not load | Check network access and provider credentials; free Libretro covers use GitHub-hosted image URLs |
| Cloud sync fails | Reconnect the provider and verify OAuth tokens or WebDAV credentials |

## Documentation

- [Deployment](./docs/DEPLOYMENT.md)
- [Architecture map](./docs/ARCHITECTURE_MAP.md)
- [Project plan](./docs/PLAN.md)
- [Netplay guide](./docs/NETPLAY.md)
- [User testing checklist](./docs/USER_TESTING.md)
- [Support runbook](./docs/SUPPORT_RUNBOOK.md)
- [Contributing guide](./CONTRIBUTING.md)

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before opening a pull request.

Good pull requests usually include:

- A focused explanation of what changed and why
- Tests for behavior changes
- Documentation updates for user-facing behavior
- Performance measurements for performance claims
- Notes on upstream EmulatorJS patches when vendored files change

Run at least:

```bash
npm test
npm run build
```

## Legal

RetroOasis does not include copyrighted games or proprietary BIOS files. You are responsible for using legally obtained content. Emulator cores, third-party APIs, artwork repositories, and cloud providers are subject to their own licenses and terms.

## Credits

- [EmulatorJS](https://emulatorjs.org/)
- [RetroArch](https://www.retroarch.com/) and the libretro core communities
- [PPSSPP](https://www.ppsspp.org/)
- [Vite](https://vitejs.dev/)
- [Vitest](https://vitest.dev/)
- [Playwright](https://playwright.dev/)
- [ramiabraham/cover-art-collection](https://github.com/ramiabraham/cover-art-collection)
- [xero/boxart](https://github.com/xero/boxart)
- [libretro-thumbnails](https://github.com/libretro-thumbnails)

## License

RetroOasis is licensed under the MIT License. See [LICENSE](./LICENSE).

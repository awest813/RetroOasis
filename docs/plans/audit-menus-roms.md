# Menus, settings and Downloads ROM audit

Audit date: 2026-10-07. Scope: every menu and page (Home, Library, game page, Add ROM, Saves, Settings), every Settings control, and every game and disc image in `Downloads` (825 zipped cartridge ROMs in `Games/`, 9 CHD discs, 7 N64 ROMs, loose zips). Run on Windows 11, Chromium (Playwright) against a production build, plus unit suites.

The plan below ranks each finding **P0** (loses data or breaks play), **P1** (confusing, wrong or looks unfinished) or **P2** (polish), says what was done, and how it is covered by a test.

## 1. Method

| Pass | How | Result |
| --- | --- | --- |
| Static ROM check | Every zip tested (CRC), header checked per system (Game Boy logo and checksum, GBA fixed byte, iNES, Mega Drive `SEGA`). | 825 / 825 intact. 5 notes: 2 translated GBA hacks with odd sizes (normal), 1 zip holding a `.nes` and a `.sav`, 2 Famicom Disk System images. |
| Auto-detect | Every file through `detectRomPlatform` (the Add ROM code path). | 825 / 825 detected the right system. |
| Boot in the real player | Every ROM loaded in `player.html` (Stable cores from the CDN), then three frame samples, then Start/A input. | See section 3. |
| Settings | Every control driven in the built app (49 checks): state, DOM effect, persistence across reload, section rail. | All pass after the fixes. |
| Add ROM | Real zips, CHDs, a save, an image, a 2.6 GB `.7z`, plus truncated, empty, garbage and oddly named files. | See section 4. |
| Devices | 11 viewports × 8 routes: desktop 1920, laptops 1366 and 1440 hi-dpi, Chromebook 1366 and 1280 (touch, ChromeOS user agent), tablets 768, 820 and 1024, phones 390, 360 and 844×390 landscape. Overflow, tap size, font size, clipped text. | No horizontal overflow anywhere. Touch-target and font findings fixed. |
| Edge cases | Hostile routes, search strings, titles and URLs; storage that throws; slow library; bad player parameters. | See section 4. |

## 2. Findings and fixes

### P0 / P1

| # | Finding | Fix | Covered by |
| --- | --- | --- | --- |
| 1 | **Linking a ROM folder found nothing.** Collections name folders `Nintendo - Game Boy Advance`, `Sega - Genesis` and so on; only short names like `gba` matched. Linking `Downloads` or `Games` (system folders one level down) also found nothing, with no explanation. | `platformFromFolder` understands Libretro / No-Intro / Redump names, and the scanner looks one level down when the folder has no system folders. The hosted-manifest generator uses the same names. | `test-archives` (15 folder names), browser check with two folder shapes |
| 2 | **Dreamcast and DVD `.chd` files were saved as PlayStation games.** Crazy Taxi (GD-ROM) and Madden NFL 08 (DVD) would start the PlayStation core and stall. | The CHD metadata is read before saving. GD-ROM, DVD and hard-disk images are refused with a reason. CD images pass. | `test-archives`; all 9 real CHDs classified correctly |
| 3 | **Editing one field of a game erased its other edits.** Rename a game, then add a year: the new title was lost. | `formFieldsToPatch` keeps saved edits for fields left as shown. | `test-overrides` |
| 4 | **A blank title saved a blank title** (empty heading, empty tile, tab title `RetroOasis ·`). | Fields are trimmed; a blank title restores the original. | `test-overrides`, browser check |
| 5 | **Settings markup was broken.** The Sound section ended in a stray open row, and the Advanced section's first row had no wrapper plus an extra `</div>` that closed the whole settings container early. | Markup repaired. | Browser check: every row and the footer sit inside the container |
| 6 | **A broken `%` in a link threw** (`#/game/%E0%A4%A`). | Safe decoding in the router. Page names also ignore case (`#/Settings`, `#/library/GBA`). | `test-router` |
| 7 | **Shared links flashed "Game not found" while the library loaded** (seconds on a slow phone), and Library flashed "Add a ROM to start". | The game page and the library wait until the hosted list, saved ROMs and linked folder have loaded. | Browser check with the manifest held for 2.5 s and 6 s |
| 8 | **A multi-gigabyte `.7z` we could not read was assumed to be an arcade set.** A 2.6 GB PC game would have been saved and never played. | Unreadable archives above 512 MB ask for a system instead. | `test-archives` |
| 9 | **Damaged downloads were saved as games** (a truncated zip, a text file renamed `.zip`) and failed later as a blank player. | Zips, 7z and RAR files are checked at Add ROM. Zero-byte files say "empty" (the old text said "doesn't have a name"). | `test-archives`; 825 real zips raise no false alarms |
| 10 | **Famicom Disk System games opened RetroArch's own menu** with no explanation (they need `disksys.rom`). | The game page now has a **BIOS card** for disk games, found by name or by looking inside the zip. Add your `disksys.rom` once (it must be 8 KB), it stays on the device, and Play hands it to the player. Add ROM tells you when a disk game is saved without it. | Browser check: wrong size refused, file kept across reload, `/disksys.rom` present in the emulator file system with 8192 bytes |
| 11 | **A game that starts but never draws looked like a hang** (`Goemon 2` on the Stable core, `Kid Dracula`). | If the picture stays one flat colour for about 30 seconds, the player offers **Try Nightly** and Dismiss. | Browser check on `Kid Dracula` |
| 12 | **A `.chd` of a Dreamcast or DVD disc that reached the player some other way** (a hosted or linked folder) still started the PlayStation core. | The player reads the CHD header and explains why it can't play it. | Browser check on `Crazy Taxi` |
| 13 | **A huge `.exe`-only archive was read as a DOS game.** | Archives over 700 MB are not assumed to be DOS. | `test-archives` |

### P2 / polish

| # | Finding | Fix |
| --- | --- | --- |
| 14 | The game page showed `roms/Nintendo%20-%20Game%20Boy%20Advance/...` and `Core gba`. | Shows the system name and the file as named on disk. |
| 15 | Tab titles said `RetroOasis · gba`. | Use the shelf name (`Game Boy Advance`). |
| 16 | The "Sample entries fill the shelf…" hint stayed on a library of 825 real games. | Only shown while fewer than 12 real games exist. |
| 17 | Two cards for the same title (Pocket Bomberman, Wario Land II, SMB2) looked identical. | Cards that share a title and system show their region and revision tags, and every card has a tooltip. |
| 18 | Phone Settings section chips were 40 px (the audit rule is 44). The brand link, search boxes, selects and skip link were 22–38 px on touch screens. Chip counts were 10.5 px. Landscape phone category labels were 9.9 px. | 44 px minimum on touch, 11 px minimum text. The touch rules also apply to touch laptops and Chromebooks (`any-pointer: coarse`). |

## 3. Boot results (real player, Stable channel)

All 848 ROM files were loaded: 825 zipped cartridge ROMs, 7 N64, 9 CHD discs, and 7 loose zips.

| System | ROMs | Result | Notes |
| --- | --- | --- | --- |
| Game Boy and Color | 250 | 250 start and draw | Some titles fade in slowly (Zelda Oracles, Mario Golf, Azure Dreams took 10 to 25 s on this CPU-bound machine). |
| Game Boy Advance | 150 | 150 | |
| NES | 275 | 271 draw | **4 do not:** `Go for it! Goemon 2` (a translation hack; draws on the Nightly core), `Kid Dracula (World)` (flat gray on Stable and Nightly), and the two Famicom Disk System games (need `disksys.rom`, now handled by the BIOS card). |
| Mega Drive / Genesis | 150 | 150 | |
| SNES | 2 | 2 | |
| N64 | 7 | 7 | Mario Tennis, Mega Man 64, Mario Party 3, Perfect Dark, Pokémon Stadium 1 and 2 (zip), Smash Bros., Ocarina of Time. |
| PlayStation CD | 8 | 8 | Bloody Roar 2, Top Shop, Fighter Maker, Marvel vs. Capcom, Mortal Kombat Trilogy, Jedi Power Battles, Tekken 3 and the 212 MB Dragon Ball Z zip. |
| Not playable | 2 | refused | `Crazy Taxi` (Dreamcast GD-ROM) and `Madden NFL 08` (DVD). Both used to start the PlayStation core and stay on its menu. |

Median start was 14 s, and the longest 43 s, with four browsers sharing one CPU. The core, not RetroOasis, decides whether a game runs, so the four NES failures are recorded as core limitations rather than app bugs.

## 4. Edge cases run (all pass after fixes)

- 12 hostile or malformed routes: no uncaught error, a sensible page every time.
- 9 search strings (regex characters, HTML, 500 characters, emoji, whitespace): no HTML injection, page stays alive.
- Hostile edited title, description and cover URL (`<b onmouseover>`, `<script>`, `javascript:`): rendered as text, the cover URL is never used, a 300-character title causes no overflow.
- `localStorage` that throws on every call (private mode): every page renders, Settings still toggles for the session.
- Player: no ROM, missing ROM, a web page instead of a ROM, a dead `blob:` URL, an unknown core, and a `back` of `javascript:` or an external site (both become Home).
- Add ROM: mixed batch of real files plus truncated, empty, garbage, extension-less and symbol-heavy names. Every file gets a row; a batch with a skip never launches the player; re-adding a file replaces it.

## 5. Still open

| # | Item | Priority | Plan |
| --- | --- | --- | --- |
| 19 | Game Boy and Game Boy Color share one filter chip (`GB 251`). | P2 | Split into two chips by the cartridge header's colour flag, not by folder. Needs a second platform id in the catalog, so it touches the shelf, search and covers. |
| 20 | The System picker in Add ROM lists systems RetroOasis can play, but a hand-picked system still accepts unsupported discs (Xbox, PlayStation 2). | P2 | Add a short "Not supported yet" note to the picker and refuse `.iso` files whose volume says Xbox or PlayStation 2. |
| 21 | `Kid Dracula (World)` (gray screen on both cores) and `Go for it! Goemon 2` on Stable are emulator-core limits. | P2 | Report upstream with the ROM headers. The Try Nightly prompt covers Goemon 2. |
| 22 | Firefox and WebKit were not run against this audit's checks. | P2 | `npm --prefix retrooasis run test:ui` runs under Chromium; run it with Playwright's Firefox and WebKit builds once and record the result. |
| 23 | The FDS BIOS has only been tested with a placeholder 8 KB file, because no real `disksys.rom` is available here. | P2 | Confirm with your own `disksys.rom`: the game should start in the disk loader instead of RetroArch's menu. |

## 6. Added to the repo

- `npm --prefix retrooasis run test:roms -- "<folder>"`: boots every ROM in a folder of system folders in the real player (opt-in, loopback, read-only).
- `npm --prefix retrooasis run test:ui`: every Settings control, hostile routes and search text, and layout checks on eight device classes (opt-in, needs Playwright).
- New unit checks in `npm test`: CHD media, folder names, damaged archives, size guards, router decoding and case, edit merging.

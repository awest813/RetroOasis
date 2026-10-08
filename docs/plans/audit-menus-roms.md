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

## 7. Online play and UI bug pass (follow-up)

Run against the real room host: Settings (host ready), game pages for NES, Game Boy, N64 and PlayStation, the join page in each state, a hosted NES room with a guest, and a Trade & link session with a guest cartridge, on desktop, Chromebook, tablet, phone and phone landscape. Plus hostile names, a full room, pause, end room, a reload, offline play and big text.

| # | Finding | Fix |
| --- | --- | --- |
| 24 | **Every page opened part-way down.** Clicking a game far down the library opened its page scrolled; Settings reopened at its old position. | A new page starts at the top. Back to Settings still returns to your place. |
| 25 | **Join errors were off screen.** "Room not found" and "room is full" sat under the steps, below the fold on a phone. | The message now sits above the join form. |
| 26 | **Online pages missed the touch rules.** The logo link, guest Start/Select pills, seat buttons and the host's "Invite players" were 28–40 px; "Back to library" 21 px; the player's Exit link 28 px on Chromebooks. | 44 px hit areas (Exit keeps its look and gets a larger touch area), including touch laptops. |
| 27 | **Start link was below both consoles on a phone** once the friend's game arrived. | It scrolls into view the first time it can be pressed. |
| 28 | **The folded invite section had no arrow.** | It shows one, like the other sections. |
| 29 | **Playing a hosted game offline said "Failed to fetch".** | It explains you're offline (or the server isn't answering) and offers Try again. |
| 30 | **Large text sizes widened the game page and Saves.** | The two-column game page switches by text size, long button labels wrap, card headers wrap. |
| 31 | **EmulatorJS's icon-only menu button had no name** for screen readers. | Named "Game menu". |

## 8. Dreamcast and PSP: loading and core access

What the audit found, and what changed.

**Dreamcast has no core to load.** `cdn.emulatorjs.org` has no Flycast build on the Stable, Nightly or Latest channel (reports and core files all return 404), and EmulatorJS's source has none. So there is nothing for RetroOasis to start. The work was to stop pretending:

| # | Finding | Fix |
| --- | --- | --- |
| 32 | A Dreamcast `.chd` was only caught by its metadata, and `.gdi` / `.cdi` files fell into "File type isn't recognized". | Dreamcast, GameCube, Wii, Wii U, Switch and Xbox file types are named and refused with one plain sentence. |
| 33 | Xbox, GameCube, Wii and PlayStation 2 disc images (`.iso`) could be saved and started on the wrong core. Halo (Xbox) in Downloads is one. | The image's own header says which system it is (Xbox media signature, GameCube and Wii magic numbers, a `SYSTEM.CNF` on a disc over 800 MB). |
| 34 | Linking a folder silently skipped `Sega - Dreamcast`, `Sony - PlayStation 2` and similar. | Settings lists them: "Skipped Dreamcast, PlayStation 2: RetroOasis has no browser emulator for them yet." `npm run oasis:manifest` prints the same. |

**PSP has a core, with two catches.**

| # | Finding | Fix |
| --- | --- | --- |
| 35 | The PPSSPP core exists only as a threaded build (`ppsspp-thread-wasm.data`), so on GitHub Pages every PSP game stopped at "Needs extra setup". | The player installs the service worker, which adds COOP and COEP to `player.html?threads=1`, then reloads once. Checked on a plain static server with no isolation headers: the core starts, the page is isolated, a second visit needs no reload, other pages are untouched, and a browser that blocks service workers gets a clear message instead of a loop. Settings → Thread support now says "On demand" instead of "Missing". |
| 36 | `Madden NFL 08 (USA).chd` is a PSP game (1.5 GB, DVD-type CHD), but the shipped PPSSPP build has no CHD support and aborted (`missing function: CHDFileBlockDevice`) while the player kept saying "playing". | A UMD-sized DVD `.chd` is recognised as a PSP game the browser core can't open, with the fix (`chdman extractdvd`); the player refuses a `.chd` for the PSP core before starting it. |
| 37 | Any core that aborts after starting left a dead screen under "playing". | The player shows "The emulator stopped" with the likely cause, Try again, and Try Nightly on Stable. |

Not tested: a real PSP game. None is in Downloads, so the PSP checks used a placeholder disc image: they prove the core downloads, the threads and assets load, and the error paths, not gameplay.

Checked and fine: pasting a whole invite link, lower case and spaces; a blank, hostile or 90-character name (shown as text, trimmed, no overflow); a third player in a two-seat room; Lock and Unlock room; host pause (guest sees why); End room (guest told, join form back); a dead socket; resizing across nine sizes on six pages; reduced motion; 835 games in the library (first tile in 0.9 s, search in 0.4 s).

Not covered: a real second device on the network and physical controllers.

## 9. Invite-address picker with several network adapters

Checked with adapter lists shaped like a Windows PC (Wi-Fi, Ethernet, WSL, Hyper-V Default Switch, Wi-Fi Direct and Bluetooth with 169.254 addresses, Tailscale, ZeroTier, OpenVPN), a Mac (en0, en5, bridge100, utun for Tailscale and a VPN) and a Linux box (wlp, enp, docker0, br-, virbr0, tailscale0, WireGuard), through the real room host with the adapters faked.

| # | Finding | Fix |
| --- | --- | --- |
| 38 | **The room host read the adapters once, at start.** Joining Wi-Fi later, a changed DHCP address or Tailscale coming up afterwards left guests refused ("Use this server's LAN address") and the invite list stale until the host restarted. | The adapters are re-read every two seconds, for the host check, the invite list and the QR check. Tested: an address that appears is accepted and offered; one that disappears is refused. |
| 39 | **Self-assigned 169.254 addresses were offered as invites** (Windows creates several, for Wi-Fi Direct and Bluetooth). | Left out whenever a real network exists; shown, labelled "No network (self-assigned address)", only when nothing else is. |
| 40 | **Mac `en0` was labelled "Ethernet"** (it is Wi-Fi on a laptop). VPN tunnels, Hyper-V, Docker, libvirt, Podman and Internet Sharing bridges were raw names or unranked. | `en0`-style names say "Wi-Fi or Ethernet"; VPNs say "(VPN)"; virtual-machine adapters go last. |
| 41 | **The picker never said what a choice means.** | A hint under it: pick the network your friends are on (several real networks); friends need the same Tailscale, Nebula or ZeroTier; a VPN usually works only for that VPN; a virtual adapter can't be reached by friends; no network at all. Shown straight away when the best address is a virtual adapter. |
| 42 | **On a phone the new hint squeezed the picker to a few letters** in the first version. | The hint spans the whole row; the picker is 44 px tall and inside the panel. |
| 43 | **Nothing tested this.** | `test:lan` covers the three platforms, duplicates, public addresses, no adapters and the live re-read; the browser run covered the picker, invite link, QR, hints, a guest opening the invite and a phone layout. |

Still not covered: a second real device joining over each address.

## 10. Simpler game cards

The game page stacked up to four bordered cards (online play, Transfer Pak, save data, BIOS) under a header that said the system three times and printed the file name in monospace. On a phone an N64 game was 1,500 px tall. The library tiles repeated the game's title inside every placeholder cover, right above the caption that already said it.

| # | Before | After |
| --- | --- | --- |
| 44 | Header: breadcrumb "GB", a "GB" badge, "Game Boy / Color · Pokemon - Crystal Version (USA, Europe) (Rev 1).zip". | One line: "Game Boy / Color · USA, Europe · Rev 1 · year". The region and revision come from the file name; the full file name is the tooltip. Badges appear only when they say something (Sample, Disc set, Edited, needs threads). |
| 45 | Separate cards, each with a heading, a state pill, a paragraph and a large button. | One panel of rows: title and state on the left, the action on the right, a hairline between rows. On a phone the action goes full width under the text. Same ids and behaviour. |
| 46 | Wordy copy ("Trade and battle on one link cable. Your friend joins from their browser with their own game and save. 2 players."). | One short sentence each ("Link cable for trades and battles. Your friend brings their own game and save."). "Online room" is "Play with a friend". |
| 47 | Transfer Pak showed a three-part fact list at all times. | Folded under "How it works". |
| 48 | The Options menu opened below all the cards, far from the Options button. | It opens directly under Play / Options. |
| 49 | Placeholder covers repeated the title; the caption repeated it again. | Placeholders show the system ("GBA", "N64") on the cartridge graphic; the caption names the game. |
| 50 | Library hint: "Sample entries fill the shelf so you can explore the UI — hide them in Settings if you only want real ROMs." Add ROM: two paragraphs, an always-on "Using the Stable channel…" line. Saves: two paragraphs. | One sentence each. The channel line shows only when you changed it. |

An N64 game page on a phone is now about 1,100 px (it was 1,500), and a Game Boy page on a desktop fits one screen.

### Every case

After the redesign each page was driven through its combinations, on desktop, tablet, phone, a 320 px phone and phone landscape (about 1,100 page loads, no screenshots needed unless something failed).

| Surface | Cases |
| --- | --- |
| Game page | 18 games (every online system, link systems, Famicom disk with BIOS, PSP and DOS with thread badges, disc set, 140-character unbroken title, long titled game with many tags, HTML characters in the title, no year or developer, long description, one-letter title) × 6 room-host states (ready, 404, unreachable, wrong version, core missing, 3.5 s timeout), plus the demo games, a saved game with a previous save, a saved ROM, an edited game, and the Options menu and edit form open on three games. Phone also at 200% text. |
| Library | empty with and without samples, one game, twelve, 700, favorites and recents with items and empty, a system with no games, an unknown system, the same title three times, search with no results and clearing it. |
| Home | the same sets, TV layout with CRT, the PlayStation accent, keyboard through every category. |
| Add ROM | one good file, twelve mixed files (good, long name, Unicode name, save, empty, cut zip, Dreamcast, PSP-as-CHD, `.gdi`, no extension, a raw track), twenty files, nothing usable. |
| Saves | none and 40 saves (long names, folders), search, backup, eight restore files (valid, empty list, wrong format, other version, path traversal, states, not JSON, empty), cancel, confirm, delete, the save-states tab. |
| Settings | 8 room-host answers × 4 storage states (roomy, nearly full, full, unreported). |

Found and fixed:

| # | Finding | Fix |
| --- | --- | --- |
| 51 | A lone `.bin` was saved as a PlayStation game whatever it was, so a Mega Drive `.bin` would run on the wrong core. | The header decides: a Mega Drive header is Mega Drive, a raw CD sector is a PlayStation track, anything else asks. |
| 52 | A backup made by another version of RetroOasis said "Choose a RetroOasis save backup". | It says it was made by a different version and what to do. |
| 53 | The "Online play setup" link under an unavailable online row was 17–42 px tall, and the Transfer Pak picker 39 px in landscape. | Both are 44 px. |
| 54 | `npm run test:saves` had been failing since the Saves page started naming games (the page loads the catalog, which the test page didn't provide). | The test page provides it; the suite passes again, with a new check for the version message. |

Everything else passed: no sideways scroll, nothing outside the screen, no cut-off text, no "undefined", every online state showed the right label and enabled the right buttons, saved, edited, uploaded and demo games showed the right rows and badges, and the Options menu opened above the rows every time.

## 11. Cover art and offline cores

**Cover art.** All 825 games in the Downloads library were matched against the real Libretro thumbnail listings (no image downloads): 781 had art before, 790 after. The nine new matches were games whose file names end in a bracket tag such as `[T-En by …] [Vanilla Unlock]`, `[i]` or `[!]`; any trailing `[tag]` is now treated as a dump or patch note and dropped before matching. A local fake thumbnail host then ran every case in a browser:

| Case | Result |
| --- | --- |
| Exact name, wrong region found after a few misses, slow host, no art anywhere | Art shows; placeholder first for the slow host; the placeholder names the system. |
| Corrupt image bytes, dropped connection, redirect, 429 rate limit | A placeholder with no broken-image icon; a 429 is not remembered as "no art". |
| Revisit | Finished art asks for one URL; games with no art make no requests. |
| 150 tiles | Only tiles near the screen ask for art; scrolling loads the rest. |
| Offline | Seen art comes from the worker's cache; unseen art is a clean placeholder, and nothing reaches the thumbnail host. |

Found and fixed:

| # | Finding | Fix |
| --- | --- | --- |
| 55 | Going offline, every cover without a saved copy walked its whole chain of candidate names, each failing, and was then remembered as "no art" — so the library stayed bare after reconnecting. | While offline a failed cover is a placeholder and nothing is remembered; the `online` event re-arms the missing covers and they load. |

**Offline cores.** Each of 8 systems (Game Boy, GBA, NES, Mega Drive, SNES, N64, PlayStation, PSP) was played online, then again with the emulator CDN blocked; plus cases for a core that was never cached, a damaged core and the local channel.

| # | Finding | Fix |
| --- | --- | --- |
| 56 | A zipped game could not start offline: the zip and 7z unpack workers came from the CDN. | They ship with the app (`emulator/compression/`) and are pre-cached by the worker. |
| 57 | PSP would not start offline even after being played. EmulatorJS discards its cached `ppsspp-assets.zip` every time, because the zip unpacks to folders and empty marker files and its integrity check rejects any empty file. It was silently re-downloaded (19 MB) on each launch. | The worker keeps its own copy of that one file (`retrooasis-core-assets-v1`, network first, offline fallback). Settings → Data → clear emulator cache removes it too. |
| 58 | A core that downloaded cut short, or as a Wi-Fi sign-in page, was stored by EmulatorJS and failed on every try; "Try again" could never fix it. | For this failure, Try again first forgets the saved cores (games, saves and BIOS files stay), then downloads fresh copies. |
| 59 | A failed download with no stated reason ("Network Error") showed a stuck EmulatorJS screen. | It shows "You’re offline" or "Couldn’t start the game" with Try again. |

All 46 checks passed: every core starts offline from its saved copy with a drawn picture, a game never played before starts on a saved core, an uncached core says it is offline and recovers on Try again, a damaged core recovers, and the local channel starts NES, Mega Drive, SNES, N64 and PlayStation with zero CDN requests (Game Boy and GBA have no local core and say so). The harness needs the CDN and the Downloads library, so it is not in the repo; the service-worker piece is covered in `npm run test:covers`.

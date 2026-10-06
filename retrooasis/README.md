# RetroOasis

Static web frontend for browsing a ROM library and launching games with [EmulatorJS](https://emulatorjs.org/). Home is an XMB-style cross menu (Outfit/Sora type, glass category icons, wave backdrop); Library, Add ROM, and Settings are leaf views. Designed to deploy as plain static files, with an installable PWA shell.

## Quick start

From the repo root:

```sh
npm run oasis:dev
```

Or from this folder:

```sh
cd retrooasis
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173/`). Dev mode proxies repo-root `data/` and `roms/` so EmulatorJS can load, and sends **COOP/COEP** headers so threaded cores (PSP/PPSSPP, DOS, 3DS) work.

### EmulatorJS cores / PSP (PPSSPP)

- The library lists **all EmulatorJS systems** (NES through PSP, 3DS, DOS, etc.).
- Settings → **Emulator files** defaults to **stable** for most systems. **PSP / 3DS / DOS** always launch on **nightly** (unless Local).
- Channels: `stable` · `nightly` · `latest` · `local` (`data/` beside the site).
- PSP/DOS/3DS require `SharedArrayBuffer`. Use the Vite dev/preview headers, or deploy `public/_headers` on a host that supports custom headers (for example, Netlify). GitHub Pages does not support custom header files.

## Scripts

| Command (in `retrooasis/`) | Purpose |
| -------------------------- | ------- |
| `npm run dev` | Local SPA + EmulatorJS data proxy |
| `npm run build` | Typecheck + production static build → `dist/` |
| `npm run preview` | Preview the production build (with thread headers) |
| `npm run typecheck` | TypeScript only, no emit |
| `npm run manifest` | Generate `../roms/manifest.json` from `roms/` |
| `npm run scan` | Scan `roms/` (+ optional sidecars / covers) |

From the **repo root**, the same workflows are exposed as `npm run oasis:*` (for example `oasis:dev`, `oasis:build`, `oasis:scan`). `npm run build` at the root runs the RetroOasis build and syncs `retrooasis/dist/` → `dist/` for GitHub Pages.

## Routes

Hash routing — no server rewrite rules required.

| Route | View |
| ----- | ---- |
| `#/` | XMB home (systems, Recent, Favorites, shortcuts) |
| `#/library` | All games grid (same as `#/library/@all`) |
| `#/library/@recent` | Recently played |
| `#/library/@favorites` | Favorites |
| `#/library/@all` | Full shelf |
| `#/library/<platform>` | One system (for example `#/library/snes`) |
| `#/game/<id>` | Game detail + Play |
| `#/upload` | Add ROM (drag-drop or file picker) |
| `#/settings` | Look, sound, emulator channel, library, data |

Play opens `player.html` (EmulatorJS iframe host) with query params for the selected game.

## Static hosting

1. Build: `npm run build` (repo root) or `npm run build` in `retrooasis/`
2. Publish the contents of the generated repo-root `dist/` folder (or `retrooasis/dist/` if you skip the sync step)
3. Place EmulatorJS **`data/`** next to the built site (same origin path `/data/…`)
4. Place your ROMs under **`roms/<platform>/…`** and list them in `catalog/games.json` or `roms/manifest.json`

`player.html` loads EmulatorJS in a dedicated page (iframe-friendly / SPA-safe) via `data/loader.js`.

### GitHub Pages

The repo includes a GitHub Actions workflow at `.github/workflows/github-pages.yml` that builds the app and deploys the generated `dist/` folder to GitHub Pages. The workflow runs on pushes to `main` and can also be triggered manually from the Actions tab.

## Catalog

- `public/catalog/platforms.json` — systems / cores
- `public/catalog/games.json` — demo titles, file paths, optional covers

Demo entries ship for UI walkthrough. Point `file` at real ROMs you host; do not commit copyrighted game binaries.

## ROM library sources

Merge order: demo catalog → `roms/manifest.json` (hosted) → **saved uploads** (IndexedDB) → linked local folder (wins on id clash).

### Saved uploads (all browsers)

**Add ROM** stores file bytes in IndexedDB on this device and adds a shelf entry. Reloads keep the title until you remove it from game detail or clear uploads in Settings. Play uses a durable `library:` reference (not a one-shot staging key). Re-adding the same filename replaces the bytes but keeps the original title/`addedAt` when possible.

Disc dumps dropped together (`.cue` + `.bin` / `.img` / `.iso`, `.ccd` + `.img`, `.m3u` playlists) are packed into one library entry so EmulatorJS sees every file. Auto-detect peeks ISO 9660 headers so a `.iso` can resolve to PSP, PlayStation, Sega CD, 3DO, or DOS instead of always assuming PSP. Settings shows browser storage use and can ask the browser to keep saved ROMs.

### Hosted manifest (all browsers)

Place ROMs under `roms/<platform>/` next to the built site, then either write `roms/manifest.json` by hand or generate it:

```sh
npm run oasis:manifest
# → ../roms/manifest.json
```

See `roms.manifest.example.json`.

### Local ROM folder (Chromium)

**Library → Link folder** (or Settings) and choose a directory shaped like:

```text
roms/
  nes/*.nes
  snes/*.sfc
  segaMD/*.md
  psx/*.bin
  covers/nes/Game.png   # optional
```

Handles are remembered in IndexedDB. Linked-folder ROMs are staged in IndexedDB before navigating to `player.html` (blob URLs do not survive that navigation). Saved uploads use a permanent library store instead.

### Sidecar metadata

Optional JSON next to a ROM (`MyGame.json` or `game.json`) enriches title, core, cover, year, developer, description, and tags. The generate script merges sidecars into `roms/manifest.json`. See `game.sidecar.example.json`.

Game detail → **Edit metadata** stores browser-local overrides (exportable JSON from Settings).

### Scan + Libretro covers

```sh
npm run oasis:scan              # write roms/manifest.json
npm run oasis:scan -- --covers  # also HEAD-probe Libretro's GitHub image host
```

In the UI, **Online box art** (Settings, on by default) fills missing boxart at browse time. Local/custom art is tried first. Matching preserves original ROM punctuation, region and language tags, then removes recognized dump/revision/disc metadata before trying common regions and leading/trailing article variants. Meaningful subtitles and sequel numbers stay intact. A renamed title takes priority over an unrelated ROM filename. Lookups are capped at 18 names per system; Game Boy/Color can try both systems. Images come from Libretro's GitHub repositories, which work with the emulator's isolation headers. Successful matches are reused across views during the session, and removed views stop retries. Samples and unmatched games keep their placeholders. Turning the setting off disables automatic lookups.

Generated manifests retain a literal `romFilename` beside the encoded `file` URL, so filenames containing `%` or `#` are matched without accidental URL decoding. The `--covers` scan uses the same matcher as the UI and probes each image with a five-second timeout.

Linked-folder cover buckets match full ROM names. An untagged cover such as `Game.png` can serve regional versions of that title; a tagged cover such as `Game (Europe).png` stays with its exact ROM name and takes priority over generic artwork, regardless of folder order. Short prefixes cannot assign art to sequels, and existing covers take priority.

For manually chosen artwork, open a game's **Options → Edit metadata** and use **Cover URL**. The editor and Settings link to [The Cover Project](https://www.thecoverproject.net/), [LaunchBox Games Database](https://gamesdb.launchbox-app.com/), [MobyGames](https://www.mobygames.com/), [GameTDB](https://www.gametdb.com/), and [Libretro thumbnails](https://github.com/libretro-thumbnails/libretro-thumbnails). Use a direct image URL rather than a cover-detail webpage. When externally hosted art cannot load, host the image with your ROM library or save a matching image in your linked folder. Automatic lookups continue to use Libretro.

**Settings → Library → Refresh cover art** clears remembered matches and retries artwork as you browse during the current session. Fresh image requests bypass the browser/app image cache; same-origin app-cached artwork remains available if the network is offline. Blob/data images and custom URLs with existing query parameters remain intact; query parameters may contain signatures required by the image host. The action preserves your cover edits and Online box art preference.

## Settings

**Settings → Controllers** reports controller access, lists connected devices and marks
the controller used for menus. Press and release a button on another standard-layout
controller to take over menu navigation. **Test buttons & sticks** shows button presses
and both stick axes; while open, it pauses controller menu actions (including Back),
so keyboard and touch remain available. Close the test and release the buttons to resume.
Custom layouts can be configured in the player's Controls menu. Each player's in-game
controller assignment is separate from the menu controller. Controllers connected before
game startup are assigned normally; disconnect, focus loss and pause release held input.
After reconnecting or returning to play, release buttons and center standard-layout sticks.
RetroOasis bundles its patched EmulatorJS frontend for every channel; the selected
Stable/Nightly/Latest/Local channel still determines core and support-file downloads.
Player frontend files are refreshed before use online and keep their last successful
offline copy. Rebuild the frontend bundle with `npm run minify` after editing `data/src/`.

All preferences persist in **localStorage** on this device (except ROM bytes and folder handles, which use IndexedDB).

| Group | Options |
| ----- | ------- |
| **Look** | Accent (Sega cyan / PS amber), Layout (Standard / TV), CRT overlay |
| **Controllers** | Live Bluetooth/USB status; D-pad and stick move, A/Cross confirm, B/Circle back, L/R shoulders move like left/right |
| **Sound & cores** | UI sounds (off by default), sound pack (Soft / XMB / Arcade), Emulator files channel, thread-support status |
| **Library** | Online box art, hide samples, saved ROMs, link local folder, hosted manifest status |
| **Data** | Browser storage / keep ROMs, install as app (PWA), local saves, clear recents & favorites, export/clear metadata edits |

Settings includes section shortcuts and remembers your focused control and scroll position when you return. Its console-style row menu supports D-pad or arrows, Enter to confirm, and Escape / B to go back. Controller troubleshooting and host setup are expandable. **Online play** explains same-Wi-Fi/LAN limits, supported systems, and separate host and guest flows. **Check again** checks the local room service, distinguishes setup, timeout, update and invalid-response failures, and enables **Choose a game** and **Enter room code** only when the service and browser support are available. The player verifies core files before creating a room. Saved ROMs belong to the browser address where they were added; the host setup explains how to add or link them at the LAN address.

## Layout, PWA & accessibility

- **XMB home**: cross-menu navigation with wave backdrop; desktop top bar is inert while focused on the menu
- **Collections rail**: Recent / Favorites / All games beside systems in Library
- **TV layout** (Settings): larger tiles/focus for couch + gamepad
- **UI sounds** (Settings): soft, XMB, or arcade packs — off by default
- **Install**: top-bar / Settings button when `beforeinstallprompt` fires; iOS uses Share → Add to Home Screen
- **Standalone mode**: home-screen launch uses `viewport-fit=cover`, safe-area padding, and hides install CTAs
- **Offline**: a banner appears when the network drops; the cached app shell and IndexedDB ROMs still open
- **File handlers**: an installed PWA can receive ROM/ISO files from the OS and send them to Add ROM
- **Skip link**: “Skip to shelf” for keyboard users (reachable from XMB and Library)
- **Onboarding**: empty-library hint in the grid when only demo samples are visible
- Escape / gamepad B goes back; focus rings for keyboard/gamepad (`:focus-visible`); mouse/touch without sticky rings
- `manifest.webmanifest` (icons + shortcuts) + `sw.js` cache the app shell and catalog (not cores/ROMs), production only

## Same Wi-Fi / LAN multiplayer

Two players can share NES, SNES and Mega Drive / Genesis games. Experimental N64 rooms offer two or four players, including analog stick, Z and C-button controls. The host runs the emulator as Player 1 and streams video and audio over WebRTC; guests control separate controller ports. Guests need no ROM or emulator download. Rooms use the local server for signaling, with no public signaling service, STUN or TURN relay.

On the host computer, prepare the default cores once while online, then start the server:

```sh
npm run oasis:lan:prepare
npm run oasis:lan
```

Open the printed **localhost** address on the host, add a real ROM or use your existing library, and choose **Host multiplayer** on its game page. In the game, choose **Create room**, select the invite address matching your Wi-Fi adapter, and share its link or QR code. The guest opens that link on the same network and chooses **Join room**. Settings → **Online play** also includes **Enter room code**, **Choose a game**, and room-service status. Demo placeholders cannot host.

Keyboard and touch work in HTTP mode. Guest gamepads require trusted HTTPS in browsers that restrict the Gamepad API. To generate certificates without installing trust automatically:

```sh
npm run oasis:lan:cert
npm run oasis:build
node retrooasis/scripts/lan-server.mjs --cert retrooasis/.lan-certs/server.pem --key retrooasis/.lan-certs/server-key.pem
```

Install the generated `ca.crt` as a trusted certificate on the devices you control, following their operating system's instructions. Keep `server-key.pem` private. Regenerate certificates if your LAN address changes. Certificate files are gitignored. A certificate from your own trusted issuer also works through `--cert` and `--key`.

The host can pause, lock, remove individual guests or end the room. Each disconnected guest has 15 seconds to reconnect in the same tab and recover their controller port; host exit ends the room. Keyboard, touch and standard gamepads are supported; guest save states and host migration are outside this release. N64 defaults to two players to reduce encoder load; four players remain experimental until tested on separate LAN devices.

For four-player N64, select **4 players · host + 3 guests** before creating the room. The controller-seat list shows open seats, reconnect reservations and each guest's game-connection readiness. Expand **Invite players** to choose the Wi-Fi address and view the link/QR code, or use **Copy invite**. Wait for all three guests to show **Ready to play**, then select a four-player mode inside the game. Removing one guest frees only that seat; other players keep their ports and controls. Joined-room status on a guest's roster does not imply that every other guest's stream is ready.

Hosting selects local, non-threaded cores and verifies their pinned SHA-256 hashes and reports before enabling a room. Preparation includes FCEUmm, Snes9x, Genesis Plus GX and Mupen64Plus-Next. The verified N64 alternate can be prepared with `npm run oasis:lan:prepare -- --core parallel_n64`. Other alternate cores need a reviewed asset pin before LAN hosting. `--refresh` re-downloads the pinned assets; it does not accept a changed upstream build silently. Missing or changed files produce a preparation error. The selected N64 build requires WebGL2.

### Game Boy / Color and GBA trade & link (experimental)

Trading and link battles need two consoles on one link cable, and cable timing is too tight to cross Wi-Fi. So the **host's browser runs both consoles**, linked in-process: SameBoy 1.0.3 for GB/GBC and two gpSP instances for GBA. The host plays Console 1. Console 2's screen and sound stream to the guest, whose controls drive it. Each player brings their **own cartridge and battery save**.

Build the link cores once on the host computer while online. The script downloads pinned open-source sources (SameBoy and its MIT boot ROMs, gpSP and its open BIOS), Emscripten 3.1.74 and RGBDS into the ignored `retrooasis/.handheld-cache/`, then verifies the output by checksum:

```sh
npm run oasis:lan:link
npm run oasis:lan
```

On a GB, GBC or GBA game page choose **Trade & link**, optionally add your `.sav`, create a room and share the invite. The guest joins, inserts their ROM and optional save under **Your cartridge** (zipped ROMs work), and the host chooses **Start link**. A Game Boy and a Game Boy Color cartridge can link: each console uses its cartridge's hardware. For GBA, Ruby/Sapphire use gpSP's Pokémon cable protocol; other games use gpSP's per-game choice (FireRed, LeafGreen and Emerald use the wireless adapter).

Save in-game after trading. The guest chooses **Save to this device**, and the host chooses **Download my save**. **End session** sends both final saves. Saves are not written back to the RetroOasis library automatically, so import them in Saves or your emulator. If the guest disconnects, both consoles pause mid-link and Console 2 keeps its cartridge until they rejoin.

Verified with original fixture cartridges in Node and in two real browsers over WebRTC: a 64-byte cable exchange between a GB and a GBC console through SameBoy's boot ROMs; per-console input, video, audio and save import/export on gpSP; guest reconnects; and final saves. **A real Pokémon trade has not been tested yet.** Please report results with your own cartridges. GBA multiboot (one cartridge) and four-player links are not supported. Prototype details are in the [handheld README](scripts/handheld/README.md).

Allow Node through the host's private-network firewall if necessary, and avoid guest Wi-Fi with client isolation. Internet multiplayer and port forwarding are not supported.

The server serves the app, EmulatorJS assets and your hosted `roms/` folder to the LAN. Device-local IndexedDB ROMs stay on the host. Rooms and reconnect credentials live in memory and disappear when the server stops.

## Repo layout

```text
retrooasis/          ← this app (Vite + TypeScript SPA)
  src/views/         ← xmb, library, detail, upload, settings
  src/lib/           ← catalog, router, store, PWA, gamepad, etc.
  public/player.html ← EmulatorJS play host
  public/catalog/    ← sample library JSON
data/                ← EmulatorJS (sibling, unchanged)
roms/                ← your ROMs (gitignored)
dist/                ← production build (synced from retrooasis/dist/)
docs/plans/          ← product plan
```

# Online play: road to shippable

Audit date: 2026-10-07. Scope: LAN online rooms on every system (NES, SNES, Mega Drive, PlayStation, N64), Game Boy / Color and GBA Trade & link, the N64 Transfer Pak, and every screen that leads into them. The goal is a feature that feels and behaves like a console's own online service, such as PlayStation Plus party play or Nintendo Switch Online local rooms. In practice that means one visual language, one obvious path, no dead ends, and clear recovery when something goes wrong.

## 1. Where it stands

### Works today (tested on one PC)

Evidence for every row is in [`retrooasis/TESTING.md`](../../retrooasis/TESTING.md).

| Area | Evidence |
| --- | --- |
| Rooms on NES, SNES, Mega Drive, PlayStation and N64 | **44 games** passed the batch harness: boot, room, join, every key on its own port, reconnect, pause and end. |
| N64 four players | Smash Bros: four HMN slots, independent cursors, live match. Mario Party 3 Battle Royal: four hands and four independent dice. |
| PlayStation | Tekken 3 challenger join. DualShock on both ports (core-verified), with both sticks over keyboard, gamepad and touch. |
| GB / GBC link | **15 pairings** linked. Real Crystal ↔ Crystal and Tetris versus play. Gold ↔ Silver and GB ↔ GBC cross-model links work. |
| GBA link | **12 pairings**. Real Ruby ↔ Ruby trade. Pokémon cable, Wireless Adapter and Advance Wars modes are detected, and unsupported games are warned about. |
| Transfer Pak | Stadium 2 read the real Crystal trainer through the UI. Writes go back to the library save, with a backup. |
| Streaming | H.264, 480 lines, uncapped capture, 2 Mbit/s start, adaptive 30/60 fps. |
| Recovery | Automatic rejoin in ~2.8 s, pause notice for guests, reserved seats, pause on drop in link rooms. |
| Data safety | Battery saves survive leaving the player, the library save path matches the player, and blank cartridge RAM is never written back. |

### Audit findings that block "shippable"

Each finding is ranked by the damage it would do to a first-time player: **P0** breaks or loses data, **P1** confuses or looks unfinished, **P2** is polish.

**UI cohesion (P1).** The SPA and the online pages are two different products.

| Finding | Where |
| --- | --- |
| SPA uses Outfit/Sora, uppercase tracked buttons and `--ro-*` tokens. The online pages use system-ui, sentence-case buttons and their own `--lan-*` colors. | `lan.css` vs `tokens.css` / `base.css` |
| The accent preference (Sega teal or PlayStation gold) applies in the app and player, but not on the join or link pages. | `lan.html`, `link.html` |
| The headers differ. The SPA top bar has a section label and nav; the online pages show a plain wordmark and text. | all online pages |
| The host room panel is a generic `<details>` with system fonts on top of the game. The room code appears only inside a URL field. | `lan-host.js` |
| The roster reads "Player 1 · Host · Host" and has no per-player identity, such as a color or controller icon. | `roster()` |
| The game page shows **Host multiplayer**, **Trade & link** and the **Transfer Pak** picker as loose controls between paragraphs. Nothing reads as one "Online" section. | `detail.ts` |
| Trade & link opens on a native file input and a long paragraph. Nothing shows the steps (cartridge → invite → guest inserts → start). | `link.html` |
| Settings → Online play doesn't mention PlayStation rooms or the Transfer Pak. | `settings.ts` |

**Flow and clarity (P1).**
- Guests can't see who else is in the room until they open a collapsed card.
- Neither side sees a lobby state such as "waiting for players" or "everyone is ready".
- The join form takes a 10-character hex code. A Switch-style flow would show it big, grouped as `A1B2C-3D4E5`, and auto-advance.
- The player top bar (`EXIT · Contra · nes · Local · playing`) shows internal core names.

**Stability (P0/P1).**
- No online end-to-end check runs in `npm test`. The browser harnesses live outside the repo.
- Host tab reload or crash ends the room with no "room closed" explanation beyond a status line.
- The link session has no autosave status visible to the guest on phones.
- FRLG/Emerald wireless trading, the EmulatorJS netplay leftovers and SNES 2P input were checked only in the batch, not in gameplay.

**Not certifiable on this machine (gate).** These need separate devices on real Wi-Fi:
- frame rate and latency over 20 minutes;
- gamepads over HTTPS;
- Safari and iOS.

## 2. Design principles (the "console online" bar)

1. **One look.** Every online surface uses the SPA tokens, fonts, buttons, focus ring and accent. The online pages share the app's top bar.
2. **One path per job.** Host is **Game page → Online → Host**, join is **invite / QR / code**, and trade is **Game page → Online → Trade & link**. Each screen has exactly one primary button.
3. **Always show the room.** A compact room bar (code, seats with colored player chips, connection quality) is visible on host and guest pages, never hidden behind a disclosure while you play.
4. **State, not prose.** Lobby, connecting, playing, paused, reconnecting and ended are explicit states with their own headline and action. No paragraphs of instructions in the default view; help is one tap away.
5. **Controller-first.** Every action is reachable by D-pad or keyboard focus, with 44 px or larger targets, and no hover-only information.
6. **Recover, don't fail.** Every error state names what happened and offers the next action (Retry, Rejoin, Back to game).

## 3. Plan

| Phase | Work | Exit check |
| --- | --- | --- |
| **1. Shared online design system** | `online.css` maps `--lan-*` to `--ro-*` tokens. It loads the app fonts on the online pages, applies the stored accent, styles buttons and inputs like the app, and adds the shared top bar. Player chips get per-seat colors (P1 red, P2 blue, P3 yellow, P4 green, as on N64 pads). | Screenshot diff: every online surface uses Outfit/Sora, `ro-btn` styling and the accent. |
| **2. Game page Online card** | One "Online" panel on the game page: **Host room** or **Trade & link**, player count and system notes, plus the Transfer Pak cartridge for N64. Settings → Online play is updated for PlayStation and the Transfer Pak. | Desktop and phone screenshots; keyboard focus order; `test:router` and the gamepad suite stay green. |
| **3. Host lobby** | The host panel becomes a lobby card: large grouped room code, QR, Copy invite, seat cards with player colors and status, and one primary action. It folds to a room bar while playing. "Experimental" moves to a small badge. The player top bar shows the system's display name. | Host flows: create, invite, ready, pause, end and drop/reconnect with the panel folded and unfolded; `test-lan-host` stays green. |
| **4. Guest join and play** | Join shows the code in groups of five and saves the name. A lobby state ("Waiting for the host…", seat chips) leads into play with a room bar (code, players, quality), stream, controls and a settings sheet. | Guest flows on desktop, phone portrait and landscape; no overflow; `test:lan` stays green. |
| **5. Trade & link stepper** | Host page: 1 Your cartridge (save chip: library or file), 2 Invite, 3 Guest's cartridge, 4 Start link. Live states: linked, saving, saved. Guest: matching steps plus a save card. | Crystal and Ruby link sessions through the new UI; `test:link` stays green. |
| **6. Transfer Pak polish** | Compatibility note (Stadium 1: Red/Blue/Yellow; Stadium 2: Gold/Silver/Crystal) and the save source next to the picker. | Stadium 2 + Crystal end to end through the UI. |
| **7. Stability gates in the repo** | Move the batch harnesses into `retrooasis/scripts/test-online-browser.mjs` (opt-in `--browser`, uses supplied ROM folders). Add a host-tab-close test. Document a soak checklist. | One command reproduces the 44-game and 27-pair audits. |
| **8. Ship gates** | Separate-device runs: 20 min of N64 four-player, a Pokémon trade across two devices, a PlayStation fighter, HTTPS gamepads, Safari and iOS guests. Accessibility pass. Remove "Experimental" only where its gate passes. | Results recorded in `TESTING.md`. |

## 4. Status (2026-10-07)

| Phase | Status |
| --- | --- |
| 1. Shared design system | **Done.** `lan.css` now carries the app tokens, fonts, accent (via `online-theme.js`), `.ro-btn`-style buttons, top bar and seat colors. |
| 2. Game page Online card | **Done.** An "Online play" or "Trade & link" card with a live state pill (Ready, Room service off, Core not prepared, Link cores not built) and setup help, plus a separate Transfer Pak card. Settings lists PlayStation and the Transfer Pak. Buttons are renamed "Host a room" and "Start Trade & link" everywhere. |
| 3. Host lobby | **Done.** Grouped room code, seat cards (P1–P4 colors, "You · host"), QR open while seats are free, Copy invite as the primary action, and auto-fold while playing. The player top bar shows system names and "Online room". |
| 4. Guest join and play | **Done.** App styling, a seat strip in the top bar, sound on first input and automatic rejoin. A lobby covers the stage until the game is on screen (seats, step tracker, controls) and returns for paused, reconnecting and lost states. |
| 5. Trade & link stepper | **Done.** A four-step tracker (cartridge → invite → their cartridge → start) advances through a live session. File pickers are restyled and Start link is the primary action. |
| 6. Transfer Pak polish | **Done.** Stadium + Blue (party and boxes in the Pokémon Lab), Stadium 2 + Blue and Crystal, and Red, Yellow and Gold without saves. Cartridges without a save are never written back. Left: GB Tower, which needs a newer core (mupen64plus-core #1154 plus a low-level RSP). |
| 7. Stability gates in the repo | **Open.** The online, link, UI-screenshot and stream-diagnostic harnesses work but live outside the repo. Next step: `scripts/test-online-browser.mjs`. |
| 8. Ship gates | **Open.** Needs separate devices on real Wi-Fi, Safari/iOS and HTTPS gamepads. Code-level fixes for older Safari and Firefox are in; runtime runs in Firefox and WebKit are still to do. |

## 5. Risks

- **The fonts come from Google Fonts.** Offline LAN rooms fall back to system-ui. That is acceptable; the tokens and buttons still match.
- **Room codes are hex.** Grouping is display-only, and pasting a full invite link still works.
- **Restyling the host panel over the game.** It must not cover the game while playing. It auto-folds (done) and gets a slimmer room bar.

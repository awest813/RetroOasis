# Regression checks

Run these commands from the repository root:

| Command | Coverage |
| --- | --- |
| `npm test` | Core-option normalization, archive parsing, disc-set grouping, controller input and player controller snapshots |
| `node scripts/test-core-options.mjs --browser` | Core-option selection, focus, Escape and external setting updates |
| `node retrooasis/scripts/test-gamepad.mjs --browser` | Controller focus, activation, release guards, background recovery, row navigation and cleanup |
| `npm --prefix retrooasis run test:disc-sets` | CUE/BIN grouping, M3U playlists, STORE zip packing |
| `npx eslint . --quiet` | Lint errors; existing warnings are omitted |
| `npm run build` | TypeScript, SPA production build and Pages artifact |
| `npm run minify` | Emulator JavaScript and CSS bundles |

Each browser command prints a fresh loopback URL. Open it and wait for the final PASS message. A FAIL message means the suite failed even if its server remains running. Stop each server when finished. `npm test` covers the command-line suites only; browser checks must also pass before release.

The save suite refuses to start on an origin with existing emulator databases and removes its own fixture databases on success. Controller browser tests simulate controller input and focus state against real DOM controls.

Before claiming device compatibility, also test a physical controller in Chrome and Safari: connect, wake, disconnect/reconnect, hold Confirm across a route change, return from another tab, and navigate menus with both D-pad and stick. Live-ROM save/load and gameplay checks require a suitable test ROM. Automated fixtures do not certify those hardware and gameplay paths.

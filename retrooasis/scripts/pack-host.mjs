// Builds the portable room host: one folder that runs on any Windows, macOS or Linux
// computer with Node.js 18+, with no install step. RetroOasis itself stays a static site;
// this is only for hosting online rooms and Trade & link.
//   release/retrooasis-host/
//     server/server.mjs     room server + Socket.IO bundled into one file (+ its lock file)
//     client-dist/          Socket.IO browser client the server hands to pages
//     app/                  the built RetroOasis app
//     data/                 EmulatorJS and the prepared multiplayer cores
//     link/                 Trade & link cores, when built (npm run oasis:lan:link)
//     roms/                 optional hosted ROMs
//     start-host.cmd / start-host.sh, README.txt
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'rolldown'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../..')
const out = path.join(repo, 'retrooasis/release/retrooasis-host')
const exists = file => fs.access(file).then(() => true, () => false)

if (!(await exists(path.join(repo, 'retrooasis/dist/index.html')))) throw new Error('Build RetroOasis first: npm run oasis:build')
if (!out.startsWith(path.join(repo, 'retrooasis/release') + path.sep)) throw new Error('Unexpected output folder.')
await fs.rm(out, { recursive: true, force: true })
await fs.mkdir(out, { recursive: true })

await build({
  input: path.join(here, 'host-entry.mjs'),
  platform: 'node',
  // ws's optional native speed-ups; it runs without them.
  external: ['bufferutil', 'utf-8-validate'],
  output: {
    file: path.join(out, 'server/server.mjs'), format: 'esm', codeSplitting: false, minify: true,
    // Bundled CommonJS packages (Socket.IO) use require, __dirname and __filename.
    banner: "import { createRequire as __roRequire } from 'node:module'; import { fileURLToPath as __roPath } from 'node:url'; import { dirname as __roDir } from 'node:path'; const require = __roRequire(import.meta.url); const __filename = __roPath(import.meta.url); const __dirname = __roDir(__filename);",
  },
  logLevel: 'warn',
})

const copy = (from, to, filter) => fs.cp(from, to, { recursive: true, filter })
await copy(path.join(repo, 'retrooasis/dist'), path.join(out, 'app'))
// The player's files and cores; source and source maps stay behind.
await copy(path.join(repo, 'data'), path.join(out, 'data'), source => !source.endsWith('.map') && !source.split(path.sep).includes('src'))
await fs.copyFile(path.join(here, 'lan-core-lock.json'), path.join(out, 'server/lan-core-lock.json'))
// Socket.IO serves its browser client from ../client-dist next to its code: next to server/.
const socketIo = path.dirname(fileURLToPath(import.meta.resolve('socket.io/package.json')))
await copy(path.join(socketIo, 'client-dist'), path.join(out, 'client-dist'), source => !source.endsWith('.map'))
const link = path.join(repo, 'retrooasis/.handheld-cache/link')
if (await exists(path.join(link, 'manifest.json'))) await copy(link, path.join(out, 'link'))
await fs.mkdir(path.join(out, 'roms'), { recursive: true })

await fs.writeFile(path.join(out, 'start-host.cmd'), '@echo off\r\ncd /d "%~dp0"\r\nnode server\\server.mjs %*\r\npause\r\n')
await fs.writeFile(path.join(out, 'start-host.sh'), '#!/bin/sh\ncd "$(dirname "$0")" || exit 1\nexec node server/server.mjs "$@"\n', { mode: 0o755 })
await fs.writeFile(path.join(out, 'README.txt'), `RetroOasis room host
====================

Hosts RetroOasis online rooms (NES, SNES, Mega Drive, PlayStation, N64) and, when
included, Game Boy / GBA Trade & link, for players on the same network.

Needs: Node.js 18 or newer (https://nodejs.org). Nothing else to install.

Start:  Windows: double-click start-host.cmd
        Linux / macOS: ./start-host.sh
Options: --port 8787 (default), --cert cert.pem --key key.pem (HTTPS, for guest gamepads)

1. Start it (above). The window shows the address to open on this computer and
   the addresses friends join at, labelled Wi-Fi, Ethernet or Tailscale.
2. On this computer open http://localhost:8787, add your games, pick one and choose
   "Host a room" (or "Start Trade & link" for Game Boy / GBA).
3. Friends open the invite link or scan the QR code. Pick the invite address
   marked Wi-Fi or Ethernet (or Tailscale for internet play).
Allow Node.js through the firewall on private networks when asked.

Playing over the internet, like a LAN party (Hamachi-style):
put every player on the same virtual LAN, then use this host as usual. No port
forwarding needed. Any of these work; the host prints the virtual LAN address too.
  - Tailscale (https://tailscale.com): free for personal use; addresses 100.x.y.z.
  - Nebula (https://github.com/slackhq/nebula, MIT licence): self-hosted.
  - ZeroTier (https://www.zerotier.com).
Rooms only accept private and virtual-LAN addresses, never the open internet.

Your games: add ROMs in the app (Add ROM) on the host computer, or put them in roms/
and list them with roms/manifest.json (see the RetroOasis README).
`)

const size = async dir => {
  let total = 0
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    total += entry.isDirectory() ? await size(file) : (await fs.stat(file)).size
  }
  return total
}
console.log(`Room host ready: ${path.relative(repo, out)} (${(await size(out) / 1048576).toFixed(1)} MB). Zip the folder to share it.`)

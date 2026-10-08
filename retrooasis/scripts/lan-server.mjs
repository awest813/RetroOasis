import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { isIP } from 'node:net'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import QRCode from 'qrcode'
import { attachRooms } from './lan-rooms.mjs'
import { LAN_PROTOCOL, LAN_CAPABILITIES, LINK_CAPABILITIES } from '../public/lan-capabilities.js'
import { inspectCore } from './lan-assets.mjs'
import { inspectLink, verifiedLinkFile, linkRoot as defaultLinkRoot, LINK_FILES } from './lan-link.mjs'
import { lanPaths } from './lan-paths.mjs'

// Private ranges, plus 100.64.0.0/10: virtual LANs such as Tailscale hand out these
// addresses, so friends on one can join over the internet like on home Wi-Fi.
const privateV4 = ip => /^127\.|^10\.|^192\.168\.|^169\.254\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)
export function isLanAddress(ip = '') {
  ip = ip.toLowerCase().replace(/^::ffff:/, '').split('%')[0]
  if (!isIP(ip)) return false
  return privateV4(ip) || ip === '::1' || /^f[cd][\da-f]{2}:|^fe[89ab][\da-f]:/.test(ip)
}
/**
 * The computer's LAN and virtual-LAN addresses, best invite first, each with a label people
 * recognise: Wi-Fi and Ethernet first, virtual LANs and VPNs next, other adapters, then
 * virtual-machine adapters (WSL, Hyper-V, Docker…) and self-assigned 169.254 addresses, which
 * guests can't reach. Self-assigned addresses are left out when a real network exists.
 */
export function describeAddresses(interfaces = os.networkInterfaces()) {
  const seen = new Set(), out = []
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (!entry || entry.internal || entry.family !== 'IPv4' || !isLanAddress(entry.address) || seen.has(entry.address)) continue
      seen.add(entry.address)
      const linkLocal = /^169\.254\./.test(entry.address)
      const tailscale = /tailscale/i.test(name) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(entry.address)
      const [rank, label, kind] = linkLocal ? [5, 'No network (self-assigned address)', 'none']
        : tailscale ? [2, 'Tailscale (internet)', 'internet']
          : /zerotier|^zt|nebula/i.test(name) ? [2, `${name} (internet)`, 'internet']
            : /vethernet|wsl|hyper-v|docker|virtualbox|vmware|vmnet|^br-|^veth|virbr|vboxnet|vmenet|vnic|bridge\d|lxcbr|lxdbr|podman|local area connection\*/i.test(name) ? [4, 'Virtual machine adapter', 'virtual']
              : /vpn|^tap|tap-|^tun\d|^utun|^ppp|wireguard|^wg\d|openvpn|anyconnect|proton|nord|mullvad|globalprotect/i.test(name) ? [3, `${name} (VPN)`, 'vpn']
                : /wi-?fi|wlan|wireless|^wl/i.test(name) ? [0, 'Wi-Fi', 'network']
                  : /ethernet|^eth|^enp|^eno|^ens|local area connection/i.test(name) ? [1, 'Ethernet', 'network']
                    : /^en\d+$/i.test(name) ? [1, 'Wi-Fi or Ethernet', 'network'] // macOS: en0 is Wi-Fi on a laptop, Ethernet on a desktop
                      : [3, name, 'other']
      out.push({ ip: entry.address, name, label, rank, kind })
    }
  }
  const sorted = out.sort((a, b) => a.rank - b.rank)
  return sorted.some(value => value.rank < 5) ? sorted.filter(value => value.rank < 5) : sorted
}
export function createLanServer({ port = 8787, cert, key, staticRoot = lanPaths.app, linkRoot = defaultLinkRoot, interfaces = () => os.networkInterfaces(), addressRefreshMs = 2000 } = {}) {
  if (!!cert !== !!key) throw new Error('Provide both --cert and --key for HTTPS.')
  const secure = !!cert
  // Re-read the adapters every couple of seconds: Wi-Fi reconnects, DHCP changes and Tailscale coming up
  // after the host started would otherwise leave guests refused at an address that is now valid.
  let snapshot = { at: -Infinity, described: [] }
  const current = () => {
    if (Date.now() - snapshot.at > addressRefreshMs) snapshot = { at: Date.now(), described: describeAddresses(interfaces()) }
    return snapshot.described
  }
  const knownHosts = () => new Set(['localhost', '127.0.0.1', '[::1]', os.hostname().toLowerCase(), ...current().map(value => value.ip)])
  let actualPort = port
  const validRequest = req => {
    if (!isLanAddress(req.socket.remoteAddress)) return false
    let url
    try { url = new URL(`${secure ? 'https' : 'http'}://${req.headers.host}`) } catch { return false }
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return false
    if (!knownHosts().has(url.hostname.toLowerCase()) || Number(url.port || (secure ? 443 : 80)) !== actualPort) return false
    return !req.headers.origin || req.headers.origin === url.origin
  }
  const roots = { '/data/': lanPaths.data, '/roms/': lanPaths.roms }
  let link = { ready: false, systems: [] }
  const refreshLink = async () => { link = await inspectLink(linkRoot); return link }
  void refreshLink()
  const serve = async (req, res) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (!validRequest(req)) { res.writeHead(403); res.end('Use this server’s LAN address.'); return }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
    let url
    try { url = new URL(req.url, 'http://localhost') } catch { res.writeHead(400); res.end('Invalid URL'); return }
    const pathname = url.pathname
    if (pathname === '/api/lan/core') {
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Content-Type', 'application/json')
      try { res.end(JSON.stringify(await inspectCore(url.searchParams.get('core')))) }
      catch { res.writeHead(400); res.end(JSON.stringify({ ready: false, error: 'Unsupported LAN core.' })) }
      return
    }
    if (pathname === '/api/lan') {
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Content-Type', 'application/json')
      await refreshLink()
      const linked = link.ready ? Object.keys(LINK_CAPABILITIES) : []
      res.end(JSON.stringify({ available: true, protocol: LAN_PROTOCOL, maxPlayers: 4, cores: [...Object.keys(LAN_CAPABILITIES), ...linked], capabilities: LAN_CAPABILITIES, secure,
        link: { ready: link.ready, systems: linked, ...(link.ready ? {} : { error: link.error }) },
        addresses: current().map(value => `${secure ? 'https' : 'http'}://${value.ip}:${actualPort}`), addressLabels: current().map(value => value.label), addressKinds: current().map(value => value.kind) }))
      return
    }
    if (pathname === '/api/lan/qr') {
      try {
        const invite = new URL(url.searchParams.get('invite'))
        if (!knownHosts().has(invite.hostname.toLowerCase()) || invite.protocol !== (secure ? 'https:' : 'http:')
          || Number(invite.port || (secure ? 443 : 80)) !== actualPort || invite.pathname !== '/lan.html'
          || !/^#[A-F0-9]{10}$/.test(invite.hash) || invite.search || invite.username || invite.password) throw new Error('Invalid invite')
        res.setHeader('Content-Type', 'image/svg+xml')
        res.setHeader('Cache-Control', 'no-store')
        res.end(await QRCode.toString(invite.href, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 }))
      } catch { res.writeHead(400); res.end('Invalid LAN invite') }
      return
    }
    if (pathname.startsWith('/link/')) {
      // Only the verified, manifest-listed link bundle; never arbitrary cache files.
      const name = pathname.slice('/link/'.length)
      if (!LINK_FILES.includes(name) || !(await refreshLink()).ready) { res.writeHead(404); res.end('Build the link cores with npm run oasis:lan:link.'); return }
      const bytes = verifiedLinkFile(linkRoot, name)
      if (!bytes) { res.writeHead(404); res.end(); return }
      res.setHeader('Content-Type', name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
      res.setHeader('Content-Length', bytes.length)
      res.setHeader('Cache-Control', 'no-store')
      res.end(req.method === 'HEAD' ? undefined : bytes)
      return
    }
    let root = staticRoot
    let relative = pathname === '/' ? 'index.html' : pathname.slice(1)
    for (const [prefix, folder] of Object.entries(roots)) {
      if (pathname.startsWith(prefix)) { root = folder; relative = pathname.slice(prefix.length); break }
    }
    try {
      relative = decodeURIComponent(relative)
      const file = path.resolve(root, relative)
      const inside = (base, target) => target.startsWith(base + path.sep)
      if (!inside(path.resolve(root), file)) throw new Error('Path outside public directory')
      const real = await fs.promises.realpath(file)
      const realRoot = await fs.promises.realpath(root)
      if (!inside(realRoot, real)) throw new Error('Symlink outside public directory')
      const stat = await fs.promises.stat(real)
      if (!stat.isFile()) throw new Error('Not a file')
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.zip': 'application/zip', '.webmanifest': 'application/manifest+json' }
      res.setHeader('Content-Type', mime[path.extname(real)] || 'application/octet-stream')
      res.setHeader('Content-Length', stat.size)
      res.setHeader('Cache-Control', 'no-store')
      if (req.method === 'HEAD') { res.end(); return }
      const stream = fs.createReadStream(real)
      stream.on('error', () => res.destroy())
      stream.pipe(res)
    } catch { res.writeHead(404); res.end('Not found') }
  }
  const server = secure ? https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, (req, res) => { void serve(req, res) })
    : http.createServer((req, res) => { void serve(req, res) })
  const io = new Server(server, { serveClient: true, transports: ['websocket'], maxHttpBufferSize: 16384,
    allowRequest: (req, callback) => callback(null, validRequest(req)), cors: { origin: false } })
  const rooms = attachRooms(io, { linkAvailable: () => link.ready })
  return { server, io, rooms, get addresses() { return current().map(value => value.ip) }, get described() { return current() }, secure, refreshLink, setPort: value => { actualPort = value } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log('Usage: node retrooasis/scripts/lan-server.mjs [--port 8787] [--cert server.pem --key server-key.pem]')
    process.exit(0)
  }
  for (let index = 0; index < args.length; index += 2) {
    if (!['--port', '--cert', '--key'].includes(args[index]) || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error('Invalid LAN server option. Use --help for available options.')
    }
  }
  const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
  const port = Number(option('--port') || 8787)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a port between 1 and 65535.')
  if (!fs.existsSync(path.join(lanPaths.app, 'index.html'))) throw new Error(lanPaths.portable ? 'The app folder is missing from this host package. Unpack the whole folder.' : 'Build RetroOasis first: npm run oasis:build')
  const lan = createLanServer({ port, cert: option('--cert'), key: option('--key') })
  lan.server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Choose another with --port.` : error.message)
    process.exitCode = 1
  })
  lan.server.listen(port, '0.0.0.0', () => {
    const protocol = lan.secure ? 'https' : 'http'
    console.log(`RetroOasis host app. Open on this computer: ${protocol}://localhost:${port}`)
    for (const { ip, label } of lan.described) console.log(`Friends join at (${label}): ${protocol}://${ip}:${port}/lan.html`)
    if (!lan.secure) console.log('Guests can use keyboard and touch. For guest gamepads, start with --cert and --key (a trusted HTTPS certificate).')
    console.log('Keep this window and the host game open. Players join on the same Wi-Fi, or over the internet on a shared virtual LAN (Tailscale, Nebula, ZeroTier). No port forwarding is needed.')
  })
  const stop = () => { lan.rooms.close(); lan.io.close(); lan.server.close() }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

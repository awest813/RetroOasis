import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAN_CAPABILITIES } from '../public/lan-capabilities.js'
import { coreLock, digest } from './lan-assets.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const selected = args.indexOf('--core')
const cores = selected < 0 ? Object.values(LAN_CAPABILITIES).map(profile => profile.cores[0]) : [args[selected + 1]]
const supported = new Set(Object.values(LAN_CAPABILITIES).flatMap(profile => profile.cores))
for (const core of cores) {
  if (!supported.has(core)) throw new Error('Choose a supported LAN core with --core.')
  for (const relative of [`reports/${core}.json`, `${core}-wasm.data`, `${core}-legacy-wasm.data`]) {
    const pin = coreLock.files[relative]
    if (!pin) throw new Error(`${core} has no verified LAN build yet. Choose a default core.`)
    const file = path.join(repo, 'data/cores', relative)
    try { if (digest(await fs.readFile(file)) === pin.sha256 && !args.includes('--refresh')) { console.log(`Verified local: ${relative}`); continue } } catch { /* download below */ }
    const response = await fetch(coreLock.source + relative, { signal: AbortSignal.timeout(120000) })
    if (!response.ok) throw new Error(`Core download failed (${response.status}): ${relative}. Retry while online.`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (!bytes.length || (response.headers.get('content-type') || '').includes('text/html')) throw new Error(`Invalid core response: ${relative}`)
    if (bytes.length !== pin.size || digest(bytes) !== pin.sha256) throw new Error(`The upstream build changed: ${relative}. Its checksum must be audited before updating the LAN core lock.`)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file + '.download', bytes)
    await fs.rename(file + '.download', file)
    console.log(`Prepared: ${relative} (${Math.round(bytes.length / 1024)} KB)`)
  }
}
console.log('Default LAN cores are ready locally. Start with npm run oasis:lan. Add a saved alternate core with --core <name>.')

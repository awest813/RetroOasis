import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { lanPaths } from './lan-paths.mjs'

/** Built by scripts/prepare-link.mjs; served to the host browser under /link/. */
export const linkRoot = lanPaths.link
export const LINK_FILES = Object.freeze(['sameboy-link.mjs', 'sameboy-link.wasm', 'gpsp-link.mjs', 'gpsp-link.wasm', 'dmg_boot.bin', 'cgb_boot.bin'])

let cached = null
/** Verifies every built file against the manifest; re-checked when the manifest changes. */
export async function inspectLink(root = linkRoot) {
  try {
    const manifestPath = path.join(root, 'manifest.json')
    // Any changed file (not just the manifest) forces a fresh verification.
    const stats = await Promise.all(['manifest.json', ...LINK_FILES].map(name => fs.stat(path.join(root, name))))
    const key = stats.map(stat => `${stat.size}:${stat.mtimeMs}`).join('|')
    if (cached?.root === root && cached.key === key) return cached.result
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    const files = new Map()
    for (const name of LINK_FILES) {
      const pin = manifest.files?.[name]
      const bytes = await fs.readFile(path.join(root, name))
      if (!pin || bytes.length !== pin.size || createHash('sha256').update(bytes).digest('hex') !== pin.sha256) throw new Error('Link core checksum differs')
      files.set(name, bytes)
    }
    const result = { ready: true, systems: ['gb', 'gba'] }
    cached = { root, key, result, files }
    return result
  } catch {
    cached = null
    return { ready: false, systems: [], error: 'Build the link cores once with npm run oasis:lan:link.' }
  }
}

/** The exact bytes that passed verification, so a file rewritten afterwards is never served. */
export function verifiedLinkFile(root, name) {
  return cached?.root === root && cached.result.ready ? cached.files.get(name) ?? null : null
}

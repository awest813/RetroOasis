import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

/** Built by scripts/prepare-link.mjs; served to the host browser under /link/. */
export const linkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.handheld-cache/link')
export const LINK_FILES = Object.freeze(['sameboy-link.mjs', 'sameboy-link.wasm', 'gpsp-link.mjs', 'gpsp-link.wasm', 'dmg_boot.bin', 'cgb_boot.bin'])

let cached = null
/** Verifies every built file against the manifest; re-checked when the manifest changes. */
export async function inspectLink(root = linkRoot) {
  try {
    const manifestPath = path.join(root, 'manifest.json')
    const stat = await fs.stat(manifestPath)
    if (cached?.root === root && cached.mtime === stat.mtimeMs) return cached.result
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    for (const name of LINK_FILES) {
      const pin = manifest.files?.[name]
      const bytes = await fs.readFile(path.join(root, name))
      if (!pin || bytes.length !== pin.size || createHash('sha256').update(bytes).digest('hex') !== pin.sha256) throw new Error('Link core checksum differs')
    }
    const result = { ready: true, systems: ['gb', 'gba'] }
    cached = { root, mtime: stat.mtimeMs, result }
    return result
  } catch {
    return { ready: false, systems: [], error: 'Build the link cores once with npm run oasis:lan:link.' }
  }
}

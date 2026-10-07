import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { lanPaths } from './lan-paths.mjs'
import { LAN_CAPABILITIES } from '../public/lan-capabilities.js'

export const coreLock = JSON.parse(await fs.readFile(new URL('./lan-core-lock.json', import.meta.url), 'utf8'))
export const coreRoot = path.join(lanPaths.data, 'cores')
export const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export async function inspectCore(core, root = coreRoot) {
  if (!Object.values(LAN_CAPABILITIES).some(profile => profile.cores.includes(core))) throw new Error('Unsupported LAN core.')
  const relative = [`reports/${core}.json`, `${core}-wasm.data`, `${core}-legacy-wasm.data`]
  let report
  for (const name of relative) {
    const pin = coreLock.files[name]
    if (!pin) return { ready: false, core, error: 'This alternate core has no verified LAN build yet. Select the default core.' }
    try {
      const bytes = await fs.readFile(path.join(root, name))
      if (bytes.length !== pin.size || digest(bytes) !== pin.sha256) throw new Error('Core checksum differs')
      if (name.endsWith('.json')) report = JSON.parse(bytes.toString('utf8'))
    } catch { return { ready: false, core, error: `Prepare the verified local core with npm run oasis:lan:prepare -- --core ${core} --refresh, then reload.` } }
  }
  return { ready: true, core, build: report.buildStart, webgl2: report.options?.defaultWebGL2 === true, threads: false }
}

// Builds the linked-console (trade / link cable) cores for LAN rooms from pinned
// open-source revisions. Everything stays in the ignored retrooasis/.handheld-cache/.
//   SameBoy v1.0.3 (MIT) + its open-source DMG/CGB boot ROMs → GB / GBC link
//   gpSP 5819380 (GPL-2.0) + its open-source BIOS → GBA link cable / wireless adapter
// Usage: npm run oasis:lan:link   (add --rebuild to rebuild existing outputs)
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { LINK_FILES, linkRoot } from './lan-link.mjs'

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cache = path.join(app, '.handheld-cache')
const scripts = path.join(app, 'scripts/handheld')
const pins = {
  emsdk: '3.1.74',
  sameboy: { url: 'https://github.com/LIJI32/SameBoy.git', tag: 'v1.0.3', rev: '208ba4afabffab9edde416f2dbb8ae459e34adb8' },
  gpsp: { url: 'https://github.com/libretro/gpsp.git', rev: '5819380c2ffb0900219d700a382ee68c464ebb99' },
  rgbds: { version: '0.9.1',
    'linux-x64': { file: 'rgbds-0.9.1-linux-x86_64.tar.xz', sha256: '5934e83b0075341531ce9c878f516e664fe2755b6c46f7ee723b48b88aa0612d' },
    'win32-x64': { file: 'rgbds-0.9.1-win64.zip', sha256: '1a96ba4393a03347606856ea74ca4beb4f89fa8d5f2ffcf88192391a9a7b19c3' } },
}
const python = process.platform === 'win32' ? 'python' : 'python3'
const exe = process.platform === 'win32' ? '.exe' : ''
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} ${args.slice(0, 2).join(' ')} failed${result.error ? `: ${result.error.message}` : ''}`)
  return result
}
const found = command => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
const revision = dir => spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim()

async function sources() {
  await fs.mkdir(cache, { recursive: true })
  const sameboy = path.join(cache, 'SameBoy')
  if (!existsSync(sameboy)) run('git', ['clone', '--quiet', '--branch', pins.sameboy.tag, pins.sameboy.url, sameboy])
  if (revision(sameboy) !== pins.sameboy.rev) throw new Error(`${sameboy} is not SameBoy ${pins.sameboy.tag}. Move it aside and run again.`)
  const gpsp = path.join(cache, 'gpsp')
  if (!existsSync(gpsp)) run('git', ['clone', '--quiet', pins.gpsp.url, gpsp])
  if (revision(gpsp) !== pins.gpsp.rev) run('git', ['-C', gpsp, 'checkout', '--quiet', pins.gpsp.rev])
  const emsdk = path.join(cache, 'emsdk')
  if (!existsSync(emsdk)) run('git', ['clone', '--quiet', 'https://github.com/emscripten-core/emsdk.git', emsdk])
  if (!existsSync(path.join(emsdk, 'upstream/emscripten/emcc.py'))) {
    // Local activation only: writes emsdk/.emscripten, never the user's shell profile.
    run(python, [path.join(emsdk, 'emsdk.py'), 'install', pins.emsdk])
    run(python, [path.join(emsdk, 'emsdk.py'), 'activate', pins.emsdk])
  }
}

async function rgbds() {
  if (found('rgbasm')) return ''
  const dir = path.join(cache, 'rgbds')
  if (existsSync(path.join(dir, 'rgbasm' + exe))) return dir + path.sep
  const release = pins.rgbds[`${process.platform}-${os.arch()}`]
  if (!release) {
    throw new Error(`Install RGBDS ${pins.rgbds.version} (https://rgbds.gbdev.io/install) so rgbasm is on PATH, then run again.`)
  }
  const { file, sha256: expected } = release
  const response = await fetch(`https://github.com/gbdev/rgbds/releases/download/v${pins.rgbds.version}/${file}`)
  if (!response.ok) throw new Error(`RGBDS download failed (${response.status}). Retry while online.`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (sha256(bytes) !== expected) throw new Error('The RGBDS release checksum changed. Audit it before updating the pin.')
  await fs.mkdir(dir, { recursive: true })
  const archive = path.join(cache, file)
  await fs.writeFile(archive, bytes)
  if (process.platform === 'win32') {
    // Windows' own bsdtar reads .zip; a Git Bash PATH may put GNU tar (no zip support) first.
    run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', archive, '-C', dir])
  } else run('tar', ['-xJf', archive, '-C', dir])
  return dir + path.sep
}

/** SameBoy's own boot ROMs (MIT), assembled exactly like its Makefile without needing make. */
async function bootRoms() {
  const tools = await rgbds()
  const source = path.join(cache, 'SameBoy')
  const obj = path.join(source, 'build/obj/BootROMs'), bin = path.join(source, 'build/bin/BootROMs')
  await fs.mkdir(obj, { recursive: true }); await fs.mkdir(bin, { recursive: true })
  run(tools + 'rgbgfx', ['-Z', '-u', '-c', 'embedded', '-o', path.join(obj, 'SameBoyLogo.2bpp'), path.join(source, 'BootROMs/SameBoyLogo.png')])
  const native = ['cc', 'clang', 'gcc'].find(found)
  let pb12
  if (native) {
    pb12 = [path.join(source, 'build/pb12' + exe)]
    run(native, ['-std=c99', path.join(source, 'BootROMs/pb12.c'), '-o', pb12[0]])
  } else {
    // No native compiler (e.g. Windows): run the compressor through Emscripten on Node.
    // emcc emits CommonJS, and retrooasis/package.json is "type": "module", so run it as .cjs.
    const built = path.join(source, 'build/pb12.js')
    pb12 = [process.execPath, path.join(source, 'build/pb12.cjs')]
    run(python, [path.join(cache, 'emsdk/upstream/emscripten/emcc.py'), '-std=c99', '-sNODERAWFS=1', path.join(source, 'BootROMs/pb12.c'), '-o', built],
      { env: { ...process.env, EM_CONFIG: path.join(cache, 'emsdk/.emscripten') } })
    await fs.rename(built, pb12[1])
  }
  const logo = await fs.readFile(path.join(obj, 'SameBoyLogo.2bpp'))
  const compressed = spawnSync(pb12[0], pb12.slice(1), { input: logo })
  if (compressed.status !== 0) throw new Error('Boot ROM logo compression failed')
  await fs.writeFile(path.join(obj, 'SameBoyLogo.pb12'), compressed.stdout)
  for (const name of ['dmg_boot', 'cgb_boot']) {
    const object = path.join(bin, name + '.o')
    run(tools + 'rgbasm', ['--include', obj + path.sep, '--include', path.join(source, 'BootROMs') + path.sep, '-o', object, path.join(source, `BootROMs/${name}.asm`)])
    run(tools + 'rgblink', ['-x', '-o', path.join(bin, name + '.bin'), object])
    await fs.rm(object)
  }
}

const rebuild = process.argv.includes('--rebuild')
await sources()
if (rebuild || !existsSync(path.join(cache, 'SameBoy/build/bin/BootROMs/cgb_boot.bin'))) await bootRoms()
if (rebuild || !existsSync(path.join(cache, 'sameboy-link.wasm'))) run(process.execPath, [path.join(scripts, 'build-sameboy.mjs')])
if (rebuild || !existsSync(path.join(cache, 'gpsp-link.wasm'))) run(process.execPath, [path.join(scripts, 'build-gpsp.mjs')])

const sourcesFor = {
  'sameboy-link.mjs': 'sameboy-link.mjs', 'sameboy-link.wasm': 'sameboy-link.wasm',
  'gpsp-link.mjs': 'gpsp-link.mjs', 'gpsp-link.wasm': 'gpsp-link.wasm',
  'dmg_boot.bin': 'SameBoy/build/bin/BootROMs/dmg_boot.bin', 'cgb_boot.bin': 'SameBoy/build/bin/BootROMs/cgb_boot.bin',
}
await fs.mkdir(linkRoot, { recursive: true })
const files = {}
for (const name of LINK_FILES) {
  const bytes = await fs.readFile(path.join(cache, sourcesFor[name]))
  await fs.writeFile(path.join(linkRoot, name), bytes)
  files[name] = { size: bytes.length, sha256: sha256(bytes) }
}
const manifest = { version: 1, built: new Date().toISOString(), sameboy: pins.sameboy.rev, gpsp: pins.gpsp.rev, emsdk: pins.emsdk, systems: ['gb', 'gba'], files }
await fs.writeFile(path.join(linkRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log('Link cores are ready. Start the LAN server (npm run oasis:lan); GB / GBC / GBA games now offer Trade & link.')

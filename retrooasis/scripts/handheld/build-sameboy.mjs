import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const cache = path.join(app, '.handheld-cache')
const source = path.join(cache, 'SameBoy')
const revision = spawnSync('git', ['-C', source, 'rev-parse', 'HEAD'], {encoding:'utf8'})
if (revision.status || revision.stdout.trim() !== '208ba4afabffab9edde416f2dbb8ae459e34adb8') throw new Error('Clone official SameBoy v1.0.3 into retrooasis/.handheld-cache/SameBoy before building.')
const sdk = path.join(cache, 'emsdk')
const output = path.join(cache, 'sameboy-link.mjs')
const excluded = new Set(['debugger.c','sm83_disassembler.c','symbol_hash.c','rewind.c','cheats.c','cheat_search.c'])
const sources = (await fs.readdir(path.join(source, 'Core'))).filter(file => file.endsWith('.c') && !excluded.has(file)).map(file => path.join(source, 'Core', file))
const exports = ['malloc','free','link_init','link_close','link_load','link_set_cable','link_set_paused','link_step','link_peek','link_serial_bits','link_key','link_pixels','link_save_size','link_save','link_restore'].map(name => '_' + name)
const result = spawnSync('python', [path.join(sdk,'upstream/emscripten/emcc.py'),
  ...sources, path.join(app,'scripts/handheld/sameboy-link.c'), '-I'+source, '-std=gnu11', '-O2',
  '-DGB_INTERNAL','-DGB_DISABLE_DEBUGGER','-DGB_DISABLE_REWIND','-DGB_DISABLE_CHEATS','-DGB_DISABLE_CHEAT_SEARCH','-DGB_DISABLE_TIMEKEEPING',
  '-DGB_VERSION="1.0.3"','-DGB_COPYRIGHT_YEAR="2025"', '-sMODULARIZE=1','-sEXPORT_ES6=1',
  '-sALLOW_MEMORY_GROWTH=1','-sENVIRONMENT=web,node', '-sEXPORTED_FUNCTIONS='+JSON.stringify(exports),
  '-sEXPORTED_RUNTIME_METHODS=["cwrap"]', '-o', output],
  {stdio:'inherit', env:{...process.env,EM_CONFIG:path.join(sdk,'.emscripten')}})
if (result.status !== 0) throw new Error('SameBoy link prototype build failed')
console.log('Built pinned SameBoy link prototype: '+output)

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const cache = path.join(app,'.handheld-cache'), source = path.join(cache,'gpsp'), sdk = path.join(cache,'emsdk')
const revision = spawnSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'})
if (revision.status || revision.stdout.trim() !== '5819380c2ffb0900219d700a382ee68c464ebb99') throw new Error('gpSP prototype requires revision 5819380c2ffb0900219d700a382ee68c464ebb99')
const makefile = await fs.readFile(path.join(source,'Makefile.common'),'utf8')
const sourceBlock = makefile.slice(0,makefile.indexOf('ifeq'))
const common = path.join(source,'libretro/libretro-common')
const files = [...sourceBlock.matchAll(/\$\((CORE_DIR|LIBRETRO_COMM_DIR)\)\/([^\s\\]+\.(?:cc|c))(?=\s|$)/g)].map(([,root,file]) => path.join(root === 'CORE_DIR' ? source : common,file))
// The upstream open-source BIOS assembly only embeds bytes. Use an equivalent
// C array to avoid GNU .incbin assembler syntax in the wasm object format.
const bios = await fs.readFile(path.join(source,'bios/open_gba_bios.bin'))
const biosC = path.join(cache,'gpsp-bios.c')
await fs.writeFile(biosC,`const unsigned char open_gba_bios_rom[${bios.length}] = {${[...bios].join(',')}};\n`)
const exports = ['malloc','free','gba_init','gba_load','gba_start','gba_connect','gba_disconnect','gba_receive','gba_set_paused','gba_run','gba_key','gba_frames','gba_sample_rate','gba_audio','gba_save_size','gba_save_data','gba_restore','gba_audio_frames','gba_pressed_polls','gba_observed_keys','gba_pixels','gba_close'].map(name=>'_'+name)
const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3',[path.join(sdk,'upstream/emscripten/emcc.py'),...files,biosC,
  path.join(app,'scripts/handheld/gpsp-link.c'),'-I'+source,'-I'+path.join(source,'libretro'),'-I'+path.join(common,'include'),
  '-O2','-DNDEBUG','-D__LIBRETRO__','-DHAVE_STRINGS_H','-DHAVE_STDINT_H','-DHAVE_INTTYPES_H','-DINLINE=inline','-DFRONTEND_SUPPORTS_RGB565',
  '-sMODULARIZE=1','-sEXPORT_ES6=1','-sALLOW_MEMORY_GROWTH=1','-sENVIRONMENT=web,node',
  '-sEXPORTED_FUNCTIONS='+JSON.stringify(exports),'-sEXPORTED_RUNTIME_METHODS=["cwrap","FS"]','-o',path.join(cache,'gpsp-link.mjs')],
  {stdio:'inherit',env:{...process.env,EM_CONFIG:path.join(sdk,'.emscripten')}})
if (result.status !== 0) throw new Error('gpSP link prototype build failed')
console.log('Built pinned gpSP link prototype')

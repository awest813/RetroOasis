// Runs code at the last moment before EmulatorJS starts the core: its files (ROM,
// retroarch.cfg) are written and Module.callMain hasn't run yet. Install before the
// loader script; several features can register (Transfer Pak, LAN controller types).
const hooks = []
let installed = false

/** fn(emulator) runs inside EmulatorJS's startGame, before the core's main(). */
export function beforeCoreStart(fn) {
  hooks.push(fn)
  if (installed) return
  installed = true
  let emulator = window.EJS_emulator
  Object.defineProperty(window, 'EJS_emulator', {
    configurable: true,
    get() { return emulator },
    set(value) {
      emulator = value
      const start = value.startGame.bind(value)
      value.startGame = function () {
        for (const hook of hooks) {
          try { hook(this) } catch (error) { console.warn('RetroOasis start hook failed', error) }
        }
        return start()
      }
    },
  })
}

export const RETROARCH_CFG = '/home/web_user/.config/retroarch/retroarch.cfg'
const REMAP_DIR = '/home/web_user/.config/retroarch/config/remaps'

/** A core-wide RetroArch remap (where input_libretro_device_pN lives; RetroArch ignores
 * those keys in retroarch.cfg). coreName is the core's library name, e.g. 'PCSX-ReARMed'. */
export function writeCoreRemap(emulator, coreName, settings) {
  const FS = emulator.Module.FS
  const dir = `${REMAP_DIR}/${coreName}`
  let path = ''
  for (const part of dir.split('/').filter(Boolean)) { path += `/${part}`; try { FS.mkdir(path) } catch { /* exists */ } }
  FS.writeFile(`${dir}/${coreName}.rmp`, Object.entries(settings).map(([name, value]) => `${name} = "${value}"`).join('\n') + '\n')
  appendRetroArchConfig(emulator, { auto_remaps_enable: 'true', input_remapping_directory: REMAP_DIR })
}
/** Appends RetroArch settings (name → value) to the config the core is about to read. */
export function appendRetroArchConfig(emulator, settings) {
  const FS = emulator.Module.FS
  let cfg = ''
  try { cfg = new TextDecoder().decode(FS.readFile(RETROARCH_CFG)) } catch { /* not written yet */ }
  const lines = Object.entries(settings).map(([name, value]) => `${name} = "${value}"`)
  FS.writeFile(RETROARCH_CFG, `${cfg.replace(/\n?$/, '\n')}${lines.join('\n')}\n`)
}

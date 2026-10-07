// N64 Transfer Pak: a Game Boy / Color cartridge plugged into Controller 1, for Pokémon
// Stadium 1 and 2 (and other Transfer Pak games). mupen64plus-next only reads the GB ROM
// and save through libretro's "N64 Transferpak" subsystem, so the player starts the core
// the way RetroArch's command line does: --subsystem gb <gb save> <gb rom> <n64 rom>.
// The GB save is this game's RetroOasis library save; whatever the N64 game writes to the
// cartridge goes back there (the save from before the session is kept as a backup).
import { readRomReference, unwrapRom } from './rom-source.js'
import { libraryCartSave, writeLibrarySave } from './library-saves.js'
import { cartridgeInfo, cartTitle, saveSettler } from './link-session.js'
export { cartTitle }
import { beforeCoreStart } from './ejs-start-hooks.js'

export const TPK_ROM = '/tp.gb', TPK_SAVE = '/tp.sav'
/** Cartridge RAM with no game in it: 0x00 / 0xFF apart from a few bytes (Gold and Silver
 * mark two bytes the first time they boot). A real save has thousands of other bytes. */
export const isBlank = bytes => {
  if (!bytes?.length) return true
  let other = 0
  for (const byte of bytes) if (byte !== 0x00 && byte !== 0xff && ++other > 16) return false
  return true
}
/**
 * Whether cartridge RAM goes back to the library. A cartridge that started without a save
 * stays that way: Transfer Pak games can't start a Game Boy game, but Stadium writes
 * scratch data into the cartridge RAM as it boots, and keeping that would put a junk
 * "save" in the library.
 */
export const keepsCartRam = (hadSave, bytes) => !!hadSave && !isBlank(bytes)
const POLL_MS = 3000

/** The core's arguments with the Transfer Pak subsystem in front of the N64 ROM. */
export function transferPakArgs(args) {
  const rest = [...args]
  const rom = rest.pop()
  return [...rest, '--subsystem', 'gb', TPK_SAVE, TPK_ROM, rom]
}

/** Loads the cartridge and its library save; throws a readable error for a bad cartridge. */
export async function loadTransferCart(reference) {
  const cart = await unwrapRom(await readRomReference(reference))
  const info = cartridgeInfo('gb', cart.bytes)
  const { save, key } = await libraryCartSave(cart.name, 'gb')
  // The player stores a game's untouched cartridge RAM when it closes; that is no save either.
  return { name: cart.name, title: cartTitle(cart.name) || info.title, bytes: cart.bytes, key, save: save && !isBlank(save.bytes) ? save.bytes : null }
}

/**
 * Call before EmulatorJS's loader runs. options.onStatus(text) reports what happened.
 * Returns { stop } to flush the last save.
 */
export function installTransferPak(cart, { onStatus = () => {} } = {}) {
  window.EJS_defaultOptions = Object.assign({}, window.EJS_defaultOptions, { 'mupen64plus-pak1': 'transfer' })
  let emulator = null, timer = null, settle = null, backedUp = false, writing = Promise.resolve()
  const read = () => { try { return emulator?.Module?.FS.readFile(TPK_SAVE) } catch { return null } }
  const sync = () => {
    if (!cart.key || !cart.save) return writing
    const bytes = read()
    if (!settle?.(bytes) || !keepsCartRam(cart.save, bytes)) return writing
    const backup = !backedUp
    backedUp = true
    writing = writing.then(() => writeLibrarySave(cart.key, bytes, { backup }))
      .then(() => onStatus(`${cart.title}’s cartridge is synced to your RetroOasis library (the save from before is kept as a backup).`), error => onStatus(`Couldn’t update ${cart.title}’s save: ${error.message}`))
    return writing
  }
  beforeCoreStart(started => {
    emulator = started
    try {
      const FS = started.Module.FS
      FS.writeFile(TPK_ROM, cart.bytes)
      // Without a save the core starts the cartridge with blank RAM (a new game).
      if (cart.save) FS.writeFile(TPK_SAVE, cart.save)
      const callMain = started.Module.callMain
      started.Module.callMain = args => callMain(transferPakArgs(args))
      settle = saveSettler(cart.save)
      timer = setInterval(sync, POLL_MS)
      onStatus(cart.save ? `Transfer Pak: ${cart.title} with your saved game.` : `Transfer Pak: ${cart.title} with no save yet. Play it in RetroOasis and save (in a Pokémon Center), or import a .sav in its player, to use your Pokémon.`)
    } catch (error) { onStatus(`The Transfer Pak couldn’t be inserted: ${error.message}`) }
  })
  const stop = () => { clearInterval(timer); sync(); sync(); return writing }
  window.addEventListener('pagehide', stop, { once: true })
  return { stop }
}

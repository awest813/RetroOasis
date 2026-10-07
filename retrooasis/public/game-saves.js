// Battery saves and the game page. The player is the only place that knows a game's save
// path (EmulatorJS names it after the ROM inside the archive), so it records the path for
// the game page, and puts in a save file the player chose there once the game starts.
export const PENDING_SAVE_KEY = 'retrooasis.pendingSave'
export const SAVE_PATHS_KEY = 'retrooasis.savePaths'

/** The save file the game page left for this game, if any; it is used once. */
export function takePendingSave(gameId, storage = globalThis.sessionStorage) {
  let raw = null
  try { raw = storage?.getItem(PENDING_SAVE_KEY) } catch { return null }
  if (!raw) return null
  try { storage.removeItem(PENDING_SAVE_KEY) } catch { /* private mode */ }
  try {
    const pending = JSON.parse(raw)
    if (!gameId || pending?.gameId !== gameId || typeof pending.data !== 'string') return null
    const bytes = Uint8Array.from(atob(pending.data), c => c.charCodeAt(0))
    return bytes.length ? { name: String(pending.name || 'save file'), bytes } : null
  } catch { return null }
}

export function rememberSavePath(gameId, path, storage = globalThis.localStorage) {
  if (!gameId || !path) return
  try {
    const map = JSON.parse(storage.getItem(SAVE_PATHS_KEY) || '{}')
    if (map[gameId] === path) return
    map[gameId] = path
    storage.setItem(SAVE_PATHS_KEY, JSON.stringify(map))
  } catch { /* private mode: the game page just won't show the save */ }
}

/**
 * Returns onStarted(emulator), for when the game is running: the save path only exists once
 * the core has started. A pending save file is written there (the save it replaces stays as
 * the "previous save" the game page can restore), loaded into the core, and the game reset
 * so it starts from it. options.onStatus(text) reports the result.
 */
export function installGameSaves(gameId, { onStatus = () => {} } = {}) {
  const pending = takePendingSave(gameId)
  return emulator => {
    const manager = emulator?.gameManager
    const path = manager?.getSaveFilePath?.()
    if (!path) return
    rememberSavePath(gameId, path)
    if (!pending) return
    try {
      const FS = manager.FS
      let folder = ''
      for (const part of path.split('/').slice(1, -1)) {
        folder += `/${part}`
        if (!FS.analyzePath(folder).exists) FS.mkdir(folder)
      }
      manager.saveSaveFiles()
      if (FS.analyzePath(path).exists) FS.writeFile(`${path}.before-trade`, FS.readFile(path))
      FS.writeFile(path, pending.bytes)
      manager.loadSaveFiles()
      manager.restart()
      onStatus(`Using your save file ${pending.name}.`)
    } catch (error) { onStatus(`Couldn’t use ${pending.name}: ${error.message}`) }
  }
}

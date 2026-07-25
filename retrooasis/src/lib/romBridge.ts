import { idbDelete, idbGet, idbSet, PENDING_ROM_STORE } from './idb'
import { friendlyError, isQuotaError } from './userErrors'

export const IDB_ROM_PREFIX = 'idb:'

export interface PendingRom {
  filename: string
  bytes: ArrayBuffer
  type: string
  createdAt: number
}

function pendingKey(): string {
  return `rom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Stage ROM bytes so they survive full navigation into player.html. */
export async function stageRomForPlay(file: Blob, filename: string): Promise<string> {
  const key = pendingKey()
  let bytes: ArrayBuffer
  try {
    bytes = await file.arrayBuffer()
  } catch (err) {
    throw new Error(
      friendlyError(err, 'Couldn’t read that ROM file. Try again, or pick a smaller file.'),
    )
  }

  const record: PendingRom = {
    filename,
    bytes,
    type: file.type || 'application/octet-stream',
    createdAt: Date.now(),
  }

  try {
    await idbSet(key, record, PENDING_ROM_STORE)
  } catch (err) {
    if (isQuotaError(err)) {
      throw new Error(
        'This browser is out of storage space. Remove some saved ROMs in Settings, then try Play again.',
      )
    }
    throw new Error(
      friendlyError(err, 'Couldn’t prepare that ROM for play. Try again in a moment.'),
    )
  }

  return `${IDB_ROM_PREFIX}${key}`
}

export function isStagedRomRef(rom: string): boolean {
  return rom.startsWith(IDB_ROM_PREFIX)
}

export async function takeStagedRom(romRef: string): Promise<File> {
  if (!isStagedRomRef(romRef)) {
    throw new Error('This play link is invalid. Go back and press Play again.')
  }
  const key = romRef.slice(IDB_ROM_PREFIX.length)
  const record = await idbGet<PendingRom>(key, PENDING_ROM_STORE)
  if (!record?.bytes) {
    throw new Error('This play session expired. Go back and press Play again.')
  }
  await idbDelete(key, PENDING_ROM_STORE)
  return new File([record.bytes], record.filename || 'game.bin', {
    type: record.type || 'application/octet-stream',
  })
}

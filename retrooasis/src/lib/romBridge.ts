import { idbDelete, idbGet, idbSet, PENDING_ROM_STORE } from './idb'

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
  const record: PendingRom = {
    filename,
    bytes: await file.arrayBuffer(),
    type: file.type || 'application/octet-stream',
    createdAt: Date.now(),
  }
  await idbSet(key, record, PENDING_ROM_STORE)
  return `${IDB_ROM_PREFIX}${key}`
}

export function isStagedRomRef(rom: string): boolean {
  return rom.startsWith(IDB_ROM_PREFIX)
}

export async function takeStagedRom(romRef: string): Promise<File> {
  if (!isStagedRomRef(romRef)) {
    throw new Error('Not a staged ROM reference')
  }
  const key = romRef.slice(IDB_ROM_PREFIX.length)
  const record = await idbGet<PendingRom>(key, PENDING_ROM_STORE)
  if (!record?.bytes) {
    throw new Error('ROM session expired. Return to the library and launch again.')
  }
  await idbDelete(key, PENDING_ROM_STORE)
  return new File([record.bytes], record.filename || 'game.bin', {
    type: record.type || 'application/octet-stream',
  })
}

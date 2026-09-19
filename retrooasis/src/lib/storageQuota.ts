/** Browser storage estimate + persistent-storage request for IndexedDB ROMs. */

export interface StorageSnapshot {
  usage: number
  quota: number
  percent: number
  persistent: boolean
  supported: boolean
}

const EMPTY: StorageSnapshot = {
  usage: 0,
  quota: 0,
  percent: 0,
  persistent: false,
  supported: false,
}

export async function getStorageSnapshot(): Promise<StorageSnapshot> {
  const storage = navigator.storage
  if (!storage?.estimate) return EMPTY
  try {
    const [estimate, persistent] = await Promise.all([
      storage.estimate(),
      storage.persisted?.() ?? Promise.resolve(false),
    ])
    const usage = estimate.usage ?? 0
    const quota = estimate.quota ?? 0
    return {
      usage,
      quota,
      percent: quota > 0 ? Math.min(100, (usage / quota) * 100) : 0,
      persistent: persistent === true,
      supported: true,
    }
  } catch {
    return EMPTY
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export function storageWarning(snapshot: StorageSnapshot, extraBytes = 0): string | null {
  if (!snapshot.supported || snapshot.quota <= 0) return null
  const next = snapshot.usage + extraBytes
  const percent = (next / snapshot.quota) * 100
  if (percent >= 95) {
    return 'This browser is almost out of storage space. Remove saved ROMs in Settings before adding more.'
  }
  if (percent >= 80) {
    return `Storage is ${Math.round(percent)}% full. Large ISOs may fail to save.`
  }
  return null
}

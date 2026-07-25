/** Map technical / browser errors to short, actionable UI copy. */

export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; message?: string; code?: number }
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    /quota/i.test(e.message ?? '')
  )
}

/**
 * Prefer an Error's own message when it already reads like UI copy.
 * Otherwise translate common browser failures into plain language.
 */
export function friendlyError(err: unknown, fallback: string): string {
  if (isQuotaError(err)) {
    return 'This browser is out of storage space. Remove some saved ROMs in Settings, free up disk space, then try again.'
  }

  if (err instanceof Error && err.message.trim()) {
    const msg = err.message.trim()
    // Raw IndexedDB / DOMExceptions that slipped through.
    if (/indexeddb|idb|object store|transaction|domexception/i.test(msg)) {
      return 'Something went wrong with browser storage. Try again, or clear saved ROMs in Settings.'
    }
    if (/networkerror|failed to fetch|load failed|net::/i.test(msg)) {
      return 'Network request failed. Check your connection and try again.'
    }
    if (/notallowederror|permission/i.test(msg) && /denied|dismiss|abort/i.test(msg)) {
      return 'Permission was denied. Try again and allow access when the browser asks.'
    }
    if (/aborterror|the user aborted|cancelled|canceled/i.test(msg)) {
      return 'Cancelled.'
    }
    return msg
  }

  return fallback
}

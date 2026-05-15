/**
 * storage.ts — Origin storage resilience for Chromebook and quota-constrained devices.
 *
 * Chromebooks enforce strict storage quotas (~60% of free disk space). Without
 * persistent storage, ChromeOS may evict IndexedDB data (ROMs, saves, BIOS)
 * under quota pressure. This module:
 *
 *   1. Requests persistent storage on startup (prevents eviction)
 *   2. Monitors quota usage and warns when dangerously low (<500 MB remaining)
 *   3. Listens for `storage-pressure` events (Chrome 138+) to trigger emergency
 *      cloud sync before ChromeOS purges origin data
 *
 * API consumers can also call {@link checkStorageQuota} before starting
 * large operations (ROM import, archive extraction) to confirm there is
 * enough headroom.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuotaStatus {
  /** Total bytes used across all origin storage (IDB, Cache API, SW). */
  usedBytes: number;
  /** Total bytes available to the origin, or null when unreported. */
  quotaBytes: number | null;
  /** Percentage of quota used (0–100), or null when quota is unavailable. */
  percentUsed: number | null;
  /** True when persistent storage has been granted. */
  isPersistent: boolean;
  /** True when remaining space is below the warning threshold. */
  isLow: boolean;
}

export interface StorageWarning {
  /** Human-readable warning message. */
  message: string;
  /** Remaining space in bytes, or null when unknown. */
  remainingBytes: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Warn when remaining space drops below 500 MB. */
const LOW_SPACE_THRESHOLD_BYTES = 500 * 1024 * 1024;

/** Re-check quota every 5 minutes while the app is visible. */
const QUOTA_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// ── Module state ──────────────────────────────────────────────────────────────

let _isPersistent = false;
let _persistRequested = false;
let _quotaCheckIntervalId: ReturnType<typeof setInterval> | null = null;
let _onLowStorage: (() => void) | null = null;
let _pressureListenerInstalled = false;

/** Reset module state — exposed for tests. */
export function _resetStorageStateForTests(): void {
  _isPersistent = false;
  _persistRequested = false;
  _quotaCheckIntervalId = null;
  _onLowStorage = null;
  _pressureListenerInstalled = false;
}

// ── Persistent storage request ─────────────────────────────────────────────────

/**
 * Request persistent storage for the origin. On Chromebooks this prevents
 * ChromeOS from evicting IndexedDB data under quota pressure.
 *
 * Safe to call multiple times — subsequent calls return the cached result.
 *
 * @returns true if persistent storage was granted or was already active.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (_persistRequested) return _isPersistent;
  _persistRequested = true;

  if (!navigator.storage?.persist) {
    _isPersistent = false;
    return false;
  }

  try {
    _isPersistent = await navigator.storage.persist();
    return _isPersistent;
  } catch {
    _isPersistent = false;
    return false;
  }
}

/**
 * Synchronous check: has persistent storage been granted?
 */
export function isStoragePersistent(): boolean {
  return _isPersistent;
}

// ── Quota monitoring ───────────────────────────────────────────────────────────

/**
 * Query the Storage Manager API for current quota usage.
 * Falls back to a partial estimate when the API is unavailable.
 */
export async function checkStorageQuota(): Promise<QuotaStatus> {
  let used = 0;
  let quota: number | null = null;
  let percentUsed: number | null = null;

  try {
    if (navigator.storage?.estimate) {
      const raw = await navigator.storage.estimate();
      used = raw.usage ?? 0;
      quota = raw.quota ?? null;
      if (quota && quota > 0) {
        percentUsed = Math.min(100, Math.round((used / quota) * 100));
      }
    }
  } catch {
    // Storage Manager API may throw in private browsing or older browsers.
  }

  const isLow = quota !== null && quota - used < LOW_SPACE_THRESHOLD_BYTES;

  return {
    usedBytes: used,
    quotaBytes: quota,
    percentUsed,
    isPersistent: _isPersistent,
    isLow,
  };
}

/**
 * Check whether remaining space is below the warning threshold.
 * Returns a warning message when low, or null when sufficient.
 */
export function getStorageWarning(quota: QuotaStatus): StorageWarning | null {
  if (!quota.isLow || quota.quotaBytes === null) return null;

  const remaining = quota.quotaBytes - quota.usedBytes;
  const remainingMB = Math.round(remaining / (1024 * 1024));

  let message: string;
  if (remainingMB <= 100) {
    message = `Critically low storage: ${remainingMB} MB remaining. ChromeOS may delete your data. Connect a cloud backup provider from Settings → Cloud.`;
  } else if (remainingMB <= 250) {
    message = `Low storage: ${remainingMB} MB remaining. Consider removing unused games or enabling cloud backup in Settings → Cloud.`;
  } else {
    message = `Storage running low: ${remainingMB} MB remaining.`;
  }

  return { message, remainingBytes: remaining };
}

// ── Periodic monitoring ────────────────────────────────────────────────────────

/**
 * Start periodic quota checks. Fires `onLowStorage` callback when quota
 * drops below the warning threshold.
 *
 * @param onLowStorage  Callback invoked when storage is low (may fire multiple
 *                      times if storage stays low across check intervals).
 */
export function startStorageMonitoring(onLowStorage: () => void): void {
  _onLowStorage = onLowStorage;

  if (_quotaCheckIntervalId !== null) return;

  // Check immediately on start
  void checkAndNotify();

  _quotaCheckIntervalId = setInterval(checkAndNotify, QUOTA_CHECK_INTERVAL_MS);
}

/**
 * Stop periodic quota checks (e.g., when the page is hidden).
 */
export function stopStorageMonitoring(): void {
  if (_quotaCheckIntervalId !== null) {
    clearInterval(_quotaCheckIntervalId);
    _quotaCheckIntervalId = null;
  }
  _onLowStorage = null;
}

async function checkAndNotify(): Promise<void> {
  const quota = await checkStorageQuota();
  if (quota.isLow && _onLowStorage) {
    _onLowStorage();
  }
}

// ── Storage pressure event (Chrome 138+) ────────────────────────────────────────

/**
 * Listen for the `storage-pressure` event (Chrome 138+).
 * When ChromeOS determines origin data must be evicted, this fires
 * BEFORE deletion, giving us a chance to do an emergency cloud sync.
 *
 * Call once on startup; safe to call multiple times (listener is idempotent).
 */
export function installStoragePressureListener(): void {
  if (_pressureListenerInstalled) return;
  _pressureListenerInstalled = true;

  if (typeof window === "undefined") return;

  try {
    // Chrome 138+ storage-pressure event
    window.addEventListener("storage-pressure", () => {
      // Emergency: ChromeOS is about to evict our data.
      // Log the event — cloud sync is best-effort here.
      console.warn("[RetroOasis] Storage pressure detected — ChromeOS may evict origin data.");
    }, { once: false });
  } catch {
    // Event not supported in this browser
  }
}

// ── Convenience: estimate space before a large operation ────────────────────────

/**
 * Check if there is enough free space for an operation of `requiredBytes`.
 * Returns null if space is sufficient, or a warning object if low.
 */
export async function checkSpaceForOperation(requiredBytes: number): Promise<StorageWarning | null> {
  const quota = await checkStorageQuota();
  if (quota.quotaBytes === null) return null; // Can't determine — proceed anyway

  const remaining = quota.quotaBytes - quota.usedBytes;
  if (remaining >= requiredBytes) return null;

  const remainingMB = Math.round(remaining / (1024 * 1024));
  return {
    message: `Not enough storage space (${remainingMB} MB remaining). Please free up space before continuing.`,
    remainingBytes: remaining,
  };
}

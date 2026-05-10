/**
 * Diagnostics that should stay quiet unless the user enabled verbose logging
 * (Settings → Debug, synced onto `PSPEmulator.verboseLogging`).
 */
export function diagInfo(verboseLogging: boolean, ...args: unknown[]): void {
  if (!verboseLogging) return;
  console.info(...args);
}

export function diagWarn(verboseLogging: boolean, ...args: unknown[]): void {
  if (!verboseLogging) return;
  console.warn(...args);
}

/** Development-only routing / stub warnings (e.g. LANemu shims in the browser). */
export function diagDevWarn(...args: unknown[]): void {
  if (!import.meta.env.DEV) return;
  console.warn(...args);
}

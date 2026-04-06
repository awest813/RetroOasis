/**
 * archiveStore.ts — Persistence for manual archive selections.
 *
 * When a user picks a specific game from a multi-file archive (e.g. a .cue
 * inside a zip), we remember that choice so that subsequent launches of
 * the same archive bypass the selection dialog.
 */

const PREFIX = "rv:archive:";

export class ArchiveSelectionStore {
  /** 
   * Get the previously picked candidate for an archive.
   * Keyed by the combination of filename and byte size to differentiate
   * between different versions of the same archive.
   */
  static get(fileName: string, fileSize: number): string | null {
    try {
      return localStorage.getItem(`${PREFIX}${fileName}:${fileSize}`);
    } catch {
      return null;
    }
  }

  /**
   * Remember a pick for an archive.
   */
  static set(fileName: string, fileSize: number, candidateName: string): void {
    try {
      localStorage.setItem(`${PREFIX}${fileName}:${fileSize}`, candidateName);
    } catch {
      // localStorage is best-effort
    }
  }

  /**
   * Remove a pick (e.g. if the user wants to re-select).
   */
  static clear(fileName: string, fileSize: number): void {
    try {
      localStorage.removeItem(`${PREFIX}${fileName}:${fileSize}`);
    } catch {
      // ignore
    }
  }
}

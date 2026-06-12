/**
 * n3dsImportGuards.ts — Block unsafe in-browser extraction of large 3DS images.
 */

import { formatBytes } from "./library.js";
import type { ArchiveFormat } from "./archive.js";
import { fileExt } from "./ui/gameImportHelpers.js";

export const N3DS_PACKAGE_EXTS = new Set([
  "3ds", "3dsx", "z3dsx", "cci", "zcci", "cxi", "zcxi", "app", "elf", "axf",
]);

/** Azahar cannot launch 3DS images this large from inside browser archives. */
export const LARGE_N3DS_ARCHIVE_ENTRY_BYTES = 512 * 1024 * 1024;

export interface ArchiveEntrySummary {
  name: string;
  size: number;
}

export function findLargeN3dsPackageEntry(
  candidates: readonly ArchiveEntrySummary[],
): ArchiveEntrySummary | null {
  return candidates.find((candidate) =>
    N3DS_PACKAGE_EXTS.has(fileExt(candidate.name)) &&
    candidate.size >= LARGE_N3DS_ARCHIVE_ENTRY_BYTES,
  ) ?? null;
}

export function largeN3dsArchiveErrorMessage(
  format: ArchiveFormat,
  archiveName: string,
  entry: ArchiveEntrySummary,
): string {
  return (
    `${format.toUpperCase()} archive "${archiveName}" contains a large 3DS image "${entry.name}" (${formatBytes(entry.size)}).\n\n` +
    "3DS images this large cannot be safely extracted inside the browser, and Azahar cannot launch them while they remain zipped.\n\n" +
    "Extract the archive on your device, then import the .3ds/.cci/.cxi/.app file directly."
  );
}

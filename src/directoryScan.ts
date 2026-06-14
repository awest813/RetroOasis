/**
 * directoryScan.ts — Directory-scan import (Phase 1: pure logic, no UI).
 *
 * Walks an on-disk folder tree (via the File System Access API, or a
 * `<input webkitdirectory>` FileList fallback) and produces a reviewable
 * ScanPlan: each game file paired with an inferred system, plus a list of
 * skipped files (BIOS, patches, disc-set parts, junk) with reasons.
 *
 * The scanner is purely a *file source* + *system hint*. It does NOT extract
 * archives, apply patches, or write to the library — confirmed files are handed
 * one-by-one to the existing import pipeline (resolveSystemAndAddImpl).
 *
 * See docs/DIRECTORY_SCAN_IMPORT.md for the full design.
 */

import { detectSystem, getSystemIdForFolder } from "./systems.js";
import { BIOS_REQUIREMENTS } from "./bios.js";
import {
  fileExt,
  PATCH_EXT_SET,
  UNSUPPORTED_ARCHIVE_EXT_SET,
} from "./ui/gameImportHelpers.js";

/** Why the inferred system was chosen (drives the review-screen confidence badge). */
export type InferenceSource =
  | "folder"     // matched the containing folder name (strongest signal)
  | "extension"  // unambiguous file extension
  | "header"     // ROM header fingerprint fallback
  | "ambiguous"  // extension maps to multiple systems — needs user choice
  | "unknown";   // no system could be inferred

/** A game file the scan proposes to import. */
export interface ScannedFile {
  file: File;
  relativePath: string;
  size: number;
  /** Best-guess system id, or null when the user must choose (ambiguous/unknown). */
  inferredSystemId: string | null;
  inferenceSource: InferenceSource;
}

export type SkipReason =
  | "patch"
  | "bios"
  | "disc-part"
  | "unsupported-archive"
  | "junk";

export interface SkippedFile {
  relativePath: string;
  reason: SkipReason;
}

export interface ScanPlan {
  files: ScannedFile[];
  totalBytes: number;
  skipped: SkippedFile[];
  /** True when the walk hit the maxFiles cap and stopped early. */
  truncated: boolean;
}

/** One file yielded by a directory source, with its path relative to the root. */
export interface DirectoryEntry {
  file: File;
  /** POSIX-style path relative to the scanned root, e.g. "snes/Game (USA).sfc". */
  relativePath: string;
}

export interface ScanOptions {
  /** Stop after this many files have been collected. Default 20000. */
  maxFiles?: number;
  /** Read up to this many header bytes when extension/folder detection fails. Default 4096. */
  headerBytes?: number;
  onProgress?: (filesSeen: number) => void;
}

const DEFAULT_MAX_FILES = 20000;
const DEFAULT_HEADER_BYTES = 4096;

// Non-game files that commonly litter ROM folders.
const JUNK_EXT = new Set([
  "txt", "nfo", "dat", "xml", "html", "htm", "url", "sfv", "md5", "sha1",
  "jpg", "jpeg", "png", "gif", "bmp", "webp", "ico", "pdf", "doc", "log",
  "db", "ini", "json", "yml", "yaml", "srm", "state", "sav",
]);
const JUNK_BASENAMES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

// Disc descriptor sheets/playlists, and the raw track parts they reference. When
// a directory contains a sheet, its sibling raw parts are skipped — the sheet is
// the entry the import pipeline launches from.
const DISC_SHEET_EXT = new Set(["cue", "gdi", "m3u", "ccd"]);
const DISC_PART_EXT = new Set(["bin", "img", "raw", "sub"]);

/** Lowercased filenames known to be BIOS images, derived from BIOS_REQUIREMENTS. */
const KNOWN_BIOS_FILENAMES: ReadonlySet<string> = new Set(
  Object.values(BIOS_REQUIREMENTS).flatMap((reqs) =>
    reqs.map((r) => r.fileName.toLowerCase()),
  ),
);

function baseName(relativePath: string): string {
  const slash = relativePath.lastIndexOf("/");
  return slash >= 0 ? relativePath.slice(slash + 1) : relativePath;
}

/** The immediate parent directory name (its last segment), or "" at the root. */
function parentFolderName(relativePath: string): string {
  const slash = relativePath.lastIndexOf("/");
  if (slash < 0) return "";
  const dir = relativePath.slice(0, slash);
  const inner = dir.lastIndexOf("/");
  return inner >= 0 ? dir.slice(inner + 1) : dir;
}

function dirOf(relativePath: string): string {
  const slash = relativePath.lastIndexOf("/");
  return slash >= 0 ? relativePath.slice(0, slash) : "";
}

/**
 * Build a reviewable plan from a stream of directory entries. Pure logic:
 * accepts any (async) iterable, so tests can pass a plain array.
 */
export async function buildScanPlan(
  entries: AsyncIterable<DirectoryEntry> | Iterable<DirectoryEntry>,
  opts: ScanOptions = {},
): Promise<ScanPlan> {
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const headerBytes = opts.headerBytes ?? DEFAULT_HEADER_BYTES;

  // Collect first so we can resolve directory-level disc-set grouping.
  const all: DirectoryEntry[] = [];
  let truncated = false;
  for await (const entry of entries as AsyncIterable<DirectoryEntry>) {
    if (all.length >= maxFiles) {
      truncated = true;
      break;
    }
    all.push(entry);
    opts.onProgress?.(all.length);
  }

  // Directories that contain a disc sheet — their raw parts are part of a set.
  const dirsWithSheet = new Set<string>();
  for (const entry of all) {
    if (DISC_SHEET_EXT.has(fileExt(entry.file.name))) {
      dirsWithSheet.add(dirOf(entry.relativePath));
    }
  }

  const files: ScannedFile[] = [];
  const skipped: SkippedFile[] = [];
  let totalBytes = 0;

  for (const entry of all) {
    const { file, relativePath } = entry;
    const name = file.name;
    const ext = fileExt(name);
    const lowerBase = baseName(relativePath).toLowerCase();

    // ── Skip classification (does not discard data; routes it elsewhere) ──
    if (JUNK_BASENAMES.has(lowerBase) || lowerBase.startsWith(".")) {
      skipped.push({ relativePath, reason: "junk" });
      continue;
    }
    if (KNOWN_BIOS_FILENAMES.has(lowerBase)) {
      skipped.push({ relativePath, reason: "bios" });
      continue;
    }
    if (PATCH_EXT_SET.has(ext)) {
      skipped.push({ relativePath, reason: "patch" });
      continue;
    }
    if (UNSUPPORTED_ARCHIVE_EXT_SET.has(ext)) {
      skipped.push({ relativePath, reason: "unsupported-archive" });
      continue;
    }
    if (
      DISC_PART_EXT.has(ext) &&
      dirsWithSheet.has(dirOf(relativePath))
    ) {
      // Raw track belonging to a .cue/.gdi/.m3u set in the same directory.
      skipped.push({ relativePath, reason: "disc-part" });
      continue;
    }
    if (JUNK_EXT.has(ext)) {
      skipped.push({ relativePath, reason: "junk" });
      continue;
    }

    // ── Game candidate: infer a system ──
    const folderId = getSystemIdForFolder(parentFolderName(relativePath));
    const detected = detectSystem(name);

    let inferredSystemId: string | null = null;
    let inferenceSource: InferenceSource;

    if (folderId) {
      // Folder hint is the strongest signal; it overrides on disagreement.
      inferredSystemId = folderId;
      inferenceSource = "folder";
    } else if (detected && !Array.isArray(detected)) {
      inferredSystemId = detected.id;
      inferenceSource = "extension";
    } else if (Array.isArray(detected)) {
      inferenceSource = "ambiguous";
    } else {
      // No folder hint and no extension match — try a header fingerprint.
      const header = await readHeader(file, headerBytes);
      const byHeader = header ? detectSystem(name, header) : null;
      if (byHeader && !Array.isArray(byHeader)) {
        inferredSystemId = byHeader.id;
        inferenceSource = "header";
      } else {
        inferenceSource = "unknown";
      }
    }

    files.push({
      file,
      relativePath,
      size: file.size,
      inferredSystemId,
      inferenceSource,
    });
    totalBytes += file.size;
  }

  return { files, totalBytes, skipped, truncated };
}

async function readHeader(file: File, bytes: number): Promise<ArrayBuffer | null> {
  if (bytes <= 0 || file.size === 0) return null;
  try {
    return await file.slice(0, Math.min(bytes, file.size)).arrayBuffer();
  } catch {
    return null;
  }
}

// ── Directory sources ─────────────────────────────────────────────────────────

/** Whether the File System Access directory picker is available. */
export function supportsDirectoryPicker(): boolean {
  return typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker
    === "function";
}

// Minimal structural types for the File System Access handles we touch, so the
// module compiles without depending on a specific lib.dom version.
interface FsDirectoryHandle {
  kind: "directory";
  name: string;
  values(): AsyncIterableIterator<FsDirectoryHandle | FsFileHandle>;
}
interface FsFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}

/** Recursively yield files from a FileSystemDirectoryHandle. */
export async function* entriesFromDirectoryHandle(
  handle: FsDirectoryHandle,
  prefix = "",
  depth = 0,
  maxDepth = 16,
): AsyncGenerator<DirectoryEntry> {
  if (depth > maxDepth) return;
  for await (const child of handle.values()) {
    const childPath = prefix ? `${prefix}/${child.name}` : child.name;
    if (child.kind === "directory") {
      yield* entriesFromDirectoryHandle(child, childPath, depth + 1, maxDepth);
    } else {
      yield { file: await child.getFile(), relativePath: childPath };
    }
  }
}

/**
 * Build entries from a `<input type="file" webkitdirectory>` FileList. Each File
 * carries a `webkitRelativePath` like "MyRoms/snes/Game.sfc"; we drop the leading
 * root segment so paths are relative to the scanned folder.
 */
export function entriesFromFileList(fileList: ArrayLike<File>): DirectoryEntry[] {
  const out: DirectoryEntry[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (!file) continue;
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
      || file.name;
    const slash = rel.indexOf("/");
    out.push({ file, relativePath: slash >= 0 ? rel.slice(slash + 1) : rel });
  }
  return out;
}

/** A chosen directory, ready to be walked into a ScanPlan. */
export interface DirectorySource {
  /** Root folder display name. */
  name: string;
  /** Whether this source supports a later incremental re-scan (FS Access only). */
  canRescan: boolean;
  entries(): AsyncIterable<DirectoryEntry> | Iterable<DirectoryEntry>;
}

interface PickerWindow {
  showDirectoryPicker?: (opts?: { id?: string; mode?: "read" }) => Promise<FsDirectoryHandle>;
}

/**
 * Prompt the user for a directory. Prefers the File System Access picker (which
 * supports re-scan); falls back to a hidden `<input webkitdirectory>` element.
 * Resolves to null if the user cancels or no directory mechanism is available.
 */
export async function acquireDirectory(): Promise<DirectorySource | null> {
  const picker = (globalThis as unknown as PickerWindow).showDirectoryPicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker({ id: "retrooasis-roms", mode: "read" });
      return {
        name: handle.name,
        canRescan: true,
        entries: () => entriesFromDirectoryHandle(handle),
      };
    } catch (err) {
      // AbortError = user cancelled the picker; treat as no selection.
      if (err && (err as DOMException).name === "AbortError") return null;
      // Otherwise fall through to the input fallback.
    }
  }
  return acquireDirectoryViaInput();
}

function acquireDirectoryViaInput(): Promise<DirectorySource | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    // Non-standard attributes for directory selection across browsers.
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.multiple = true;
    input.style.display = "none";
    let settled = false;
    const finish = (source: DirectorySource | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(source);
    };
    input.addEventListener("change", () => {
      const files = input.files;
      if (!files || files.length === 0) return finish(null);
      const entries = entriesFromFileList(files);
      const rootName = rootFolderName(files);
      finish({
        name: rootName,
        canRescan: false,
        entries: () => entries,
      });
    });
    // If the dialog is dismissed without a selection, clean up on focus return.
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

function rootFolderName(files: ArrayLike<File>): string {
  const first = files[0] as (File & { webkitRelativePath?: string }) | undefined;
  const rel = first?.webkitRelativePath ?? "";
  const slash = rel.indexOf("/");
  return slash > 0 ? rel.slice(0, slash) : "Selected folder";
}

/** Convenience: acquire a directory and build its scan plan in one call. */
export async function scanDirectory(
  source: DirectorySource,
  opts: ScanOptions = {},
): Promise<ScanPlan> {
  return buildScanPlan(source.entries(), opts);
}


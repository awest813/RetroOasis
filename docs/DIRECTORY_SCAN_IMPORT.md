# Directory-Scan Import — Design

> Status: Phases 1–3 shipped (scan logic, folder inference, review model, import
> glue, review dialog, and the "Scan Folder" button). Phases 4–5 remain proposed.
> Goal: bring retrom's "scan my collection" UX to RetroOasis **without** requiring a
> server, by reading an on-disk folder tree through the File System Access API and
> feeding it into the existing import pipeline.

## Motivation

Today every game enters the library one of a few ways — drag-and-drop, the mobile add
button, PWA file handling, share target, or a webretro-style URL (`docs/PLAN.md`,
`src/ui/screens/gameImport.ts`). All of them are **push** flows: the user hands us one
batch of `File` objects at a time. Users with an existing, organised ROM collection
(`/roms/snes/...`, `/roms/psx/...`) have to repeat that drag for every system, on every
device.

retrom's headline library feature is the inverse: point the app at a folder and let it
**pull** — walk the tree, infer the platform from directory layout, and catalog
everything. We can offer the same ergonomics entirely client-side. The browser already
exposes directory access two ways:

- **`showDirectoryPicker()`** (File System Access API, Chromium desktop) — returns a
  `FileSystemDirectoryHandle` we can recurse, and which can be **persisted** in IndexedDB
  for re-scan on later visits.
- **`<input type="file" webkitdirectory>`** — universal fallback (Firefox, Safari,
  Android) that yields a flat `FileList` with `webkitRelativePath` set. No persistence,
  no re-scan, but the same one-shot import.

This is purely additive: a new front-end on top of the import pipeline that already
exists. It is the lowest-risk way to close the biggest UX gap with retrom.

## Scope

In scope:

- A "Scan Folder" entry point that recursively walks a chosen directory.
- Directory-layout-aware platform inference, layered on top of `detectSystem()`.
- A pre-import **review screen** so the user can confirm/override detected systems and
  deselect files before anything is written to IndexedDB.
- Optional persistence of the directory handle for one-click re-scan that imports only
  new/changed files.

Out of scope (covered by `docs/COMPANION_SERVER.md`):

- Importing without copying bytes into IndexedDB (true "library points at files on disk").
- Cross-device shared library index.
- Background/daemon scanning.

## Non-goals / constraints

- **We still copy bytes into IndexedDB.** The File System Access API gives read handles,
  but RetroOasis launches from IndexedDB blobs (`GameLibrary.addGame(file, systemId)` →
  `getGameBlob()`), and handle permissions don't survive reliably across sessions for
  launch-time reads. So directory scan is an *import accelerator*, not a zero-copy mount.
  This must be stated in the UI so users understand storage still grows. Decoupling
  storage from the handle is the job of the companion server design.
- Must respect the existing storage-pressure guardrails (`checkSpaceForOperation()` in
  `src/storage.ts`) — a folder scan can be large, so we estimate total bytes up front and
  warn before writing, pointing at Save Sync / cleanup as today.
- No regression to the current per-file flow; this sits beside it.

## Architecture

```
                         ┌─────────────────────────────────────────┐
   "Scan Folder" button  │  directoryScan.ts (NEW)                  │
   ───────────────────►  │  • acquireDirectory()                    │
                         │      showDirectoryPicker()  OR            │
                         │      <input webkitdirectory> fallback     │
                         │  • walkDirectory(handle) → ScannedFile[]  │
                         │  • inferSystem(relPath, name) per file    │
                         └───────────────┬─────────────────────────┘
                                         │ ScanPlan
                                         ▼
                         ┌─────────────────────────────────────────┐
   review & override     │  scanReview screen (NEW, ui/screens)     │
   ───────────────────►  │  groups by system, lets user fix/skip    │
                         └───────────────┬─────────────────────────┘
                                         │ confirmed File[] + systemId
                                         ▼
                         ┌─────────────────────────────────────────┐
                         │  resolveSystemAndAddImpl()  (EXISTING)   │
                         │  per file → archive/patch/multi-disc/    │
                         │  GameLibrary.addGame()                   │
                         └─────────────────────────────────────────┘
```

The key design choice: **the scanner produces plain `File` objects and a
`preferredSystemId`, then hands each to the existing `resolveSystemAndAddImpl()`**
(`src/ui/screens/gameImport.ts`). That function already handles archive extraction,
IPS/BPS/UPS patches, multi-disc `.m3u`/CHD, native-romset detection, and dedupe via
`findByFileName()`. We must not reimplement any of that — the scanner is strictly a
*file source* plus *system hint*.

## New module: `src/directoryScan.ts`

Pure logic, no DOM, unit-testable with `fake-indexeddb` + synthetic handles.

```ts
export interface ScannedFile {
  file: File;              // resolved File ready for the import pipeline
  relativePath: string;    // e.g. "snes/Chrono Trigger (USA).sfc"
  size: number;
  inferredSystemId: string | null;   // best guess, may be overridden in review
  inferenceSource: "folder" | "extension" | "header" | "ambiguous" | "unknown";
}

export interface ScanPlan {
  files: ScannedFile[];
  totalBytes: number;
  skipped: { relativePath: string; reason: string }[]; // BIOS/patches/junk/unknown
}

/** Acquire a directory using FS Access API, falling back to webkitdirectory input. */
export async function acquireDirectory(): Promise<DirectorySource | null>;

/** Recursively walk; bounded by maxDepth and maxFiles to avoid runaway scans. */
export async function walkDirectory(
  source: DirectorySource,
  opts?: { maxDepth?: number; maxFiles?: number; onProgress?: (n: number) => void },
): Promise<ScanPlan>;
```

### Platform inference order

Per file, decide `inferredSystemId` with this precedence (highest first):

1. **Folder hint** — match the nearest ancestor directory name against a
   `FOLDER_ALIASES` table (`"snes" | "super nintendo" | "sfc" → "snes"`,
   `"psx" | "ps1" | "playstation" → "psx"`, …). This mirrors retrom's directory
   convention and is the strongest signal a user collection gives us. The alias table
   should be **derived from `SYSTEMS`** (`src/systems.ts`) — id, name, and common
   community folder names — so it stays in sync as systems are added. New table lives
   next to `SYSTEMS`; covered by a `systems.test.ts`-style test asserting every system id
   has at least one folder alias.
2. **Extension** — `detectSystem(fileName)` (`src/systems.ts`). If it returns a single
   `SystemInfo`, use it. If the folder hint and extension agree, mark high confidence.
3. **Header fingerprint** — for extensionless or ambiguous cartridge files, read the
   first few KB and call `detectSystem(fileName, headerBytes)` which already routes to
   `detectSystemFromRomHeader()` (NES/N64/SNES/3DS).
4. **Ambiguous** — extension maps to multiple systems and folder hint doesn't
   disambiguate → leave `inferredSystemId = null`, `inferenceSource = "ambiguous"`, and
   surface a picker in review (reuse the existing `pickSystem` modal).
5. **Unknown** → add to `skipped` with reason, don't import.

### What gets filtered before review

The walker classifies and routes, it does not silently drop user data:

- **Patches** (`PATCH_EXT_SET`) — kept aside; not standalone games. retrom doesn't do
  patching at all, so this is RetroOasis-specific value. (v1: list under "skipped — patch
  files"; v2: auto-pair with a same-basename ROM.)
- **BIOS-looking files** — route to the existing BIOS scan flow (`src/bios.ts` already
  scans ZIP packs for known filenames like `dc_boot.bin`) rather than the game library.
- **Archives** (`IMPORT_ARCHIVE_EXT_SET`) — pass straight through as a single `File`; the
  import pipeline owns extraction. Do **not** descend into them as if they were folders.
- **Multi-disc sets** (`.cue`+`.bin`, `.m3u`, `.gdi`, CHD) — group by directory + basename
  and present the set as one entry, then let `resolveSystemAndAddImpl()`'s existing
  multi-disc handling take over. Reuse helpers in `src/libretroPlaylist.ts` /
  `dreamcastCore.ts`.
- **Junk** (`.txt`, `.nfo`, `.png` siblings, `.DS_Store`, `Thumbs.db`) → skipped silently.

## New screen: scan review (`src/ui/screens/`)

Before writing anything, show a grouped, editable summary:

- Files grouped by inferred system, each group collapsible with a count and total size.
- Per row: filename, detected system (editable dropdown of `SYSTEMS`), include checkbox,
  and a confidence badge (folder+ext agree / ext only / header guess / ambiguous).
- A "Skipped" section listing patches, BIOS, junk with reasons, each promotable.
- Footer: total selected count + bytes, plus the `checkSpaceForOperation()` warning if the
  estimate exceeds available quota.
- Confirm runs the import loop with progress through the existing
  `loadingOverlay` helpers; dedupe relies on `GameLibrary.findByFileName()` so re-scans
  and overlapping drag-imports don't create duplicates.

This review step is important precisely because inference is heuristic: it keeps a
mis-detected folder from polluting the library, which is the main failure mode of
automatic scanning.

## Re-scan & persistence (Chromium / FS Access only)

When the source is a real `FileSystemDirectoryHandle`:

- Persist the handle in a small IndexedDB store (handles are structured-cloneable).
- On a later "Re-scan" action, re-acquire **permission** (`handle.requestPermission`),
  walk again, and diff against the library by `(relativePath, size, lastModified)` to
  import only new/changed files. This is the closest browser-only approximation of
  retrom's incremental filesystem scan jobs.
- `webkitdirectory` fallback can't persist → no re-scan; the UI hides that affordance and
  explains why.

## Integration points (existing code to touch, minimally)

| File | Change |
|---|---|
| `src/ui/screens/gameImport.ts` | Export a thin `importScannedFiles(plan, deps)` that loops `resolveSystemAndAddImpl()` with `preferredSystemId` + `{ quiet: true, launchAfterImport: false }`. No pipeline logic duplicated. |
| `src/systems.ts` | Add `FOLDER_ALIASES` table derived from `SYSTEMS` + `getSystemIdForFolder(name)` helper. |
| `src/ui/screens/` | New `scanReview.ts` screen. |
| Drop-zone / add-button UI | New "Scan Folder" button next to existing import affordances; feature-detect `showDirectoryPicker`, else wire the `webkitdirectory` input. |
| `src/directoryScan.ts` | New module (above). |

## Testing

- `directoryScan.test.ts` — synthetic directory handles / `FileList` with
  `webkitRelativePath`: assert folder-hint inference, extension fallback, header fallback,
  ambiguous → null, archive pass-through, BIOS/patch/junk routing, depth/file caps.
- Extend `systems.test.ts` — every `SYSTEMS` id has ≥1 folder alias; aliases are unique.
- e2e (Playwright, Chromium project): scan a fixture tree, confirm review screen groups
  correctly, import, and verify library count + dedupe on re-scan. Mirrors the existing
  import e2e coverage in `docs/PLAN.md`.

## Rollout

1. ✅ `directoryScan.ts` + inference + unit tests (no UI).
2. ✅ `FOLDER_ALIASES` + `getSystemIdForFolder()` in `systems.ts` + tests.
3. ✅ Scan review screen + `importScannedFiles()` glue + "Scan Folder" button.
4. Handle persistence + incremental re-scan (Chromium only).
5. Docs: add to README "Importing Games" and `docs/PLAN.md` current-state list.

### Phase 3 — as shipped

- `src/scanReviewModel.ts`: pure view-model — `buildScanReviewModel()` (groups
  candidates by system, summarises skips, counts files needing a choice) and
  `resolveScannedImports()` (applies the user's per-file choices, dropping skips
  and unknown systems). Plus `confidenceLabel()`.
- `src/directoryScan.ts`: `acquireDirectory()` (FS Access picker with a
  `webkitdirectory` fallback) and `scanDirectory()`.
- `src/ui/modals.ts`: `showScanReviewDialog(plan)` — grouped, editable review with
  a per-file system `<select>`, a live "importing N games (size)" footer, a
  skipped-files summary, and Import/Cancel.
- `src/ui/screens/gameImport.ts`: `importScannedFiles()` — loops the chosen files
  through `resolveSystemAndAdd` (`{ launchAfterImport: false, quiet: true }`),
  distinguishing newly-added games from already-present ones via library counts,
  with a progress callback.
- `src/ui.ts`: a "Scan Folder" button (shown only when a host handler is wired) +
  `onScanFolder` opt. `src/main.ts`: the orchestrator that wires acquire → scan →
  review → import with loading-overlay progress and a result toast.
- `src/style.css`: review-dialog styling.
- Tests: `scanReviewModel.test.ts` (6), `importScannedFiles.test.ts` (3), and
  three `showScanReviewDialog` DOM cases in `modals.test.ts`.

Not yet built (Phase 4): directory-handle persistence + incremental re-scan.

### Phase 1 — as shipped

- `src/directoryScan.ts`: `buildScanPlan()` (the pure, testable core), the
  `DirectoryEntry`/`ScannedFile`/`ScanPlan` types, plus directory sources
  `entriesFromDirectoryHandle()` (FS Access API) and `entriesFromFileList()`
  (`webkitdirectory` fallback), and a `supportsDirectoryPicker()` feature check.
- `src/systems.ts`: `FOLDER_ALIASES` table (curated community names + auto-seeded
  id/shortName/name) and `getSystemIdForFolder()`, with a manufacturer-prefix
  fallback for No-Intro / libretro `"Nintendo - …"` folders.
- Classification implemented: BIOS (via `BIOS_REQUIREMENTS`), patches, unsupported
  archives, disc-set raw parts (skipped when a `.cue`/`.gdi`/`.m3u`/`.ccd` sheet is
  present in the same directory), and junk/hidden files — each with a reason.
- Inference precedence implemented: folder → extension → header → ambiguous → unknown.
- Tests: `src/directoryScan.test.ts` (18) and folder-inference cases in
  `src/systems.test.ts` (5).

Not yet built (Phase 3+): the review UI, the `importScannedFiles()` glue into
`resolveSystemAndAddImpl()`, the "Scan Folder" button, and handle persistence.

## Risks

- **Browser support split** — FS Access is Chromium-only; the `webkitdirectory` fallback
  keeps the feature universal but without re-scan. Acceptable; communicated in UI.
- **Large collections** — bound the walk (`maxDepth`, `maxFiles`), stream progress, and
  gate the write behind the storage estimate so a 500 GB folder can't silently fill the
  origin quota.
- **Mis-detection** — fully mitigated by the mandatory review step before any write.

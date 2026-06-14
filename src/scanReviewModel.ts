/**
 * scanReviewModel.ts — Pure view-model for the directory-scan review screen.
 *
 * Turns a ScanPlan (from directoryScan.ts) into a grouped, summarised structure
 * the review UI renders, and resolves the user's per-file choices back into a
 * flat list of imports. No DOM — fully unit-testable.
 *
 * See docs/DIRECTORY_SCAN_IMPORT.md.
 */

import type {
  InferenceSource,
  ScanPlan,
  ScannedFile,
  SkipReason,
} from "./directoryScan.js";
import { getSystemById } from "./systems.js";

export interface ScanReviewGroup {
  /** Inferred system id, or null for the "needs a system" bucket. */
  systemId: string | null;
  /** Display label: the system name, or a prompt for the null bucket. */
  label: string;
  files: ScannedFile[];
  totalBytes: number;
}

export interface SkipSummaryItem {
  reason: SkipReason;
  label: string;
  count: number;
}

export interface ScanReviewModel {
  groups: ScanReviewGroup[];
  totalFiles: number;
  /** Bytes of files that have a system and will import by default. */
  totalBytes: number;
  /** Files with no inferred system (ambiguous/unknown) needing a user choice. */
  needsChoiceCount: number;
  skipped: SkipSummaryItem[];
}

export interface ScannedImport {
  file: File;
  systemId: string;
  relativePath: string;
}

const NEEDS_CHOICE_LABEL = "Needs a system";

const SKIP_LABELS: Record<SkipReason, string> = {
  patch: "Patch files (apply to a game after import)",
  bios: "BIOS files (add under Settings → System Files)",
  "disc-part": "Disc tracks (imported via their .cue / .gdi / .m3u)",
  "unsupported-archive": "Unsupported archive formats",
  junk: "Non-game files",
};

/** Short, user-facing confidence label for an inference source. */
export function confidenceLabel(source: InferenceSource): string {
  switch (source) {
    case "folder":    return "from folder";
    case "extension": return "from extension";
    case "header":    return "from file header";
    case "ambiguous": return "multiple matches";
    case "unknown":   return "unrecognised";
  }
}

/** Group a scan plan's candidate files by inferred system and summarise skips. */
export function buildScanReviewModel(plan: ScanPlan): ScanReviewModel {
  const groupsById = new Map<string | null, ScanReviewGroup>();

  for (const file of plan.files) {
    const key = file.inferredSystemId;
    let group = groupsById.get(key);
    if (!group) {
      const system = key ? getSystemById(key) : undefined;
      group = {
        systemId: key,
        label: system?.name ?? (key ?? NEEDS_CHOICE_LABEL),
        files: [],
        totalBytes: 0,
      };
      groupsById.set(key, group);
    }
    group.files.push(file);
    group.totalBytes += file.size;
  }

  // Known systems first (alphabetical), the "needs a system" bucket last.
  const groups = [...groupsById.values()].sort((a, b) => {
    if (a.systemId === null) return 1;
    if (b.systemId === null) return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });

  const skipCounts = new Map<SkipReason, number>();
  for (const s of plan.skipped) {
    skipCounts.set(s.reason, (skipCounts.get(s.reason) ?? 0) + 1);
  }
  const skipped: SkipSummaryItem[] = [...skipCounts.entries()]
    .map(([reason, count]) => ({ reason, label: SKIP_LABELS[reason], count }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const needsChoiceCount = groupsById.get(null)?.files.length ?? 0;
  const totalBytes = plan.files
    .filter((f) => f.inferredSystemId !== null)
    .reduce((sum, f) => sum + f.size, 0);

  return {
    groups,
    totalFiles: plan.files.length,
    totalBytes,
    needsChoiceCount,
    skipped,
  };
}

/**
 * Resolve per-file choices into the final import list. `choices` maps a file's
 * relativePath to a chosen system id, or null to skip it; files absent from the
 * map fall back to their inferred system. Files that resolve to no (or an
 * unknown) system are dropped.
 */
export function resolveScannedImports(
  plan: ScanPlan,
  choices: ReadonlyMap<string, string | null>,
): ScannedImport[] {
  const out: ScannedImport[] = [];
  for (const f of plan.files) {
    const chosen = choices.has(f.relativePath)
      ? choices.get(f.relativePath)!
      : f.inferredSystemId;
    if (chosen && getSystemById(chosen)) {
      out.push({ file: f.file, systemId: chosen, relativePath: f.relativePath });
    }
  }
  return out;
}

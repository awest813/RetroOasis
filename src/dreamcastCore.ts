/**
 * dreamcastCore.ts — Shared Flycast/Reicast helpers and GDI import utilities.
 */

/** Track file extensions bundled with a loose .gdi descriptor. */
export const DREAMCAST_GDI_TRACK_EXTENSIONS = new Set(["bin", "raw", "iso"]);

/** Default Flycast VMU options — per-game VMU in slot A1 for isolated saves. */
export const DREAMCAST_VMU_CORE_OPTIONS = {
  flycast_per_content_vmus: "VMU A1",
  flycast_vmu1_screen_display: "disabled",
  flycast_vmu2_screen_display: "disabled",
  flycast_vmu3_screen_display: "disabled",
  flycast_vmu4_screen_display: "disabled",
} as const;

const DREAMCAST_VMU_FILE_RE = /\.[a-d][12]\.bin$/i;
const DREAMCAST_VMU_SHARED_RE = /^vmu_save_.+\.bin$/i;

/** True when a basename looks like a Flycast VMU save file in /data/saves. */
export function isDreamcastVmuFileName(fileName: string): boolean {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  return DREAMCAST_VMU_FILE_RE.test(base) || DREAMCAST_VMU_SHARED_RE.test(base);
}

/** Merge VMU-related Flycast options (with reicast aliases) into launch settings. */
export function applyDreamcastVmuCoreOptions(settings: Record<string, string>): void {
  Object.assign(settings, withDreamcastCoreAliases({ ...DREAMCAST_VMU_CORE_OPTIONS }));
}

/** Mirror flycast_* libretro keys to legacy reicast_* aliases the core may read. */
export function withDreamcastCoreAliases(settings: Record<string, string>): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (key === "flycast_dsp") {
      aliases.reicast_enable_dsp = value;
    } else if (key.startsWith("flycast_")) {
      aliases[`reicast_${key.slice("flycast_".length)}`] = value;
    }
  }
  return { ...settings, ...aliases };
}

/** In-place sync of flycast_* keys already present in a live settings object. */
export function syncDreamcastCoreAliases(settings: Record<string, string>): void {
  for (const [key, value] of Object.entries(settings)) {
    if (key === "flycast_dsp") {
      settings.reicast_enable_dsp = value;
    } else if (key.startsWith("flycast_")) {
      settings[`reicast_${key.slice("flycast_".length)}`] = value;
    }
  }
}

export function dreamcastGdiFileExtension(fileName: string): string {
  const baseName = fileName.split(/[/\\]/).pop()?.toLowerCase() ?? fileName.toLowerCase();
  const dotIdx = baseName.lastIndexOf(".");
  return dotIdx > 0 && dotIdx < baseName.length - 1
    ? baseName.slice(dotIdx + 1)
    : "";
}

/** True when the selection looks like a loose GDI disc image set. */
export function isDreamcastGdiSelection(files: readonly { name: string }[]): boolean {
  return files.some((file) => dreamcastGdiFileExtension(file.name) === "gdi") &&
    files.some((file) => DREAMCAST_GDI_TRACK_EXTENSIONS.has(dreamcastGdiFileExtension(file.name)));
}

/** Filter files that belong in a packaged GDI ZIP (descriptor + track files). */
export function isDreamcastGdiPackageMember(file: { name: string }): boolean {
  const ext = dreamcastGdiFileExtension(file.name);
  return ext === "gdi" || DREAMCAST_GDI_TRACK_EXTENSIONS.has(ext);
}

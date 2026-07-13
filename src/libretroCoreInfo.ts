/**
 * libretroCoreInfo.ts — libretro-core-info / libretro-database alignment helpers.
 *
 * Authoritative extension lists and playlist db_name → RetroOasis system mapping.
 * Source: https://github.com/libretro/libretro-core-info and libretro-database.
 */

/** libretro-database `database` / playlist `db_name` → RetroOasis systemId. */
export const LIBRETRO_DB_NAME_TO_SYSTEM_ID: Readonly<Record<string, string>> = Object.freeze({
  "Nintendo - Nintendo Entertainment System": "nes",
  "Nintendo - Super Nintendo Entertainment System": "snes",
  "Nintendo - Game Boy": "gb",
  "Nintendo - Game Boy Color": "gbc",
  "Nintendo - Game Boy Advance": "gba",
  "Nintendo - Nintendo DS": "nds",
  "Nintendo - Nintendo 3DS": "3ds",
  "Nintendo - Nintendo 64": "n64",
  "Sony - PlayStation": "psx",
  "Sony - PlayStation Portable": "psp",
  "Sega - Mega Drive - Genesis": "segaMD",
  "Sega - Master System - Mark III": "segaMS",
  "Sega - Game Gear": "segaGG",
  "Sega - Saturn": "segaSaturn",
  "Sega - Dreamcast": "segaDC",
  "Sega - 32X": "sega32x",
  "Atari - 2600": "atari2600",
  "Atari - 7800": "atari7800",
  "Atari - Lynx": "lynx",
  "Mattel - Intellivision": "intv",
  "SNK - Neo Geo Pocket Color": "ngp",
  "FBNeo - Arcade Games": "arcade",
  "MAME": "mame2003",
  "DOS": "dos",
});

/**
 * Extra extensions from libretro-core-info not always mirrored in systems.ts.
 * Merged at runtime when building extension maps.
 */
export const LIBRETRO_CORE_EXTRA_EXTENSIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "3ds": ["z3dsx", "zcci", "zcxi", "elf"],
  segaDC: ["dat", "lst"],
  psx: ["pbp"],
});

/** Map a libretro playlist `db_name` to a RetroOasis systemId. */
export function libretroDbNameToSystemId(dbName: string | null | undefined): string | undefined {
  if (!dbName) return undefined;
  const trimmed = dbName.trim();
  return LIBRETRO_DB_NAME_TO_SYSTEM_ID[trimmed];
}

/** Merge libretro-core-info extras into a system's extension list (deduped). */
export function mergeLibretroCoreExtensions(systemId: string, extensions: readonly string[]): string[] {
  const extras = LIBRETRO_CORE_EXTRA_EXTENSIONS[systemId];
  if (!extras?.length) return [...extensions];
  return [...new Set([...extensions, ...extras])];
}

/**
 * RetroOasis systemId → libretro-image-matching-server console slug.
 * Explicit map so shared targets (e.g. GBA + MGBA) resolve to the preferred slug.
 */
export const SYSTEM_ID_TO_LIBRETRO_MATCHING_CONSOLE: Readonly<Record<string, string>> = Object.freeze({
  nes: "FC",
  snes: "SFC",
  gb: "GB",
  gbc: "GBC",
  gba: "GBA",
  nds: "NDS",
  n64: "N64",
  psx: "PS",
  psp: "PSP",
  segaMD: "MD",
  segaMS: "SMS",
  segaGG: "GG",
  segaSaturn: "SATURN",
  segaDC: "DC",
  sega32x: "THIRTYTWOX",
  lynx: "LYNX",
  ngp: "NGPC",
  arcade: "FBN",
  atari2600: "ATARI",
  intv: "INTELLIVISION",
  dos: "DOS",
});

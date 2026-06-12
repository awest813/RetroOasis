/**
 * profileGameTags.ts — Map library games to household profiles for optional filtering.
 */

export const PROFILE_GAME_TAGS_KEY = "retro-oasis.profile.gameTags";

export type ProfileGameTagIndex = Record<string, string[]>;

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch { /* private mode */ }
  return null;
}

export function readProfileGameTags(storage: Storage | null = getStorage()): ProfileGameTagIndex {
  if (!storage) return {};
  try {
    const raw = storage.getItem(PROFILE_GAME_TAGS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: ProfileGameTagIndex = {};
    for (const [profileId, ids] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(ids)) {
        out[profileId] = ids.filter((id): id is string => typeof id === "string");
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persistProfileGameTags(index: ProfileGameTagIndex, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(PROFILE_GAME_TAGS_KEY, JSON.stringify(index));
  } catch { /* quota */ }
}

/** Associate a library game with a profile (e.g. when imported under that profile). */
export function tagGameForProfile(gameId: string, profileId: string, storage?: Storage | null): void {
  const trimmedId = profileId.trim();
  if (!gameId || !trimmedId) return;
  const store = storage === undefined ? getStorage() : storage;
  const index = readProfileGameTags(store);
  const list = new Set(index[trimmedId] ?? []);
  list.add(gameId);
  index[trimmedId] = [...list];
  persistProfileGameTags(index, store);
}

export function getTaggedGameIds(profileId: string, storage?: Storage | null): ReadonlySet<string> {
  const index = readProfileGameTags(storage === undefined ? getStorage() : storage);
  return new Set(index[profileId] ?? []);
}

export function isGameTaggedToAnyProfile(gameId: string, storage?: Storage | null): boolean {
  const index = readProfileGameTags(storage === undefined ? getStorage() : storage);
  for (const ids of Object.values(index)) {
    if (ids.includes(gameId)) return true;
  }
  return false;
}

/**
 * When profile library filter is enabled, show games tagged to the active profile
 * plus legacy untagged games (shared household library).
 */
export function isGameVisibleForProfile(
  gameId: string,
  profileId: string,
  filterEnabled: boolean,
  storage?: Storage | null,
): boolean {
  if (!filterEnabled) return true;
  const store = storage === undefined ? getStorage() : storage;
  if (!isGameTaggedToAnyProfile(gameId, store)) return true;
  return getTaggedGameIds(profileId, store).has(gameId);
}

export function sanitizeLibraryGameIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128);
  if (ids.length === 0) return undefined;
  return [...new Set(ids)].slice(0, 10_000);
}

/** Replace a profile's tag list with snapshot library game ids (exact sync). */
export function syncLibraryTagsForProfile(
  profileId: string,
  gameIds: string[] | undefined,
  storage?: Storage | null,
): void {
  const trimmedId = profileId.trim();
  if (!trimmedId) return;
  const store = storage === undefined ? getStorage() : storage;
  const index = readProfileGameTags(store);
  const sanitized = sanitizeLibraryGameIds(gameIds);
  if (!sanitized) delete index[trimmedId];
  else index[trimmedId] = sanitized;
  persistProfileGameTags(index, store);
}

/** @deprecated Use syncLibraryTagsForProfile — kept as alias for incremental adds. */
export function mergeLibraryTagsForProfile(
  profileId: string,
  gameIds: string[] | undefined,
  storage?: Storage | null,
): void {
  if (!gameIds?.length) return;
  const trimmedId = profileId.trim();
  if (!trimmedId) return;
  for (const gameId of gameIds) {
    tagGameForProfile(gameId, trimmedId, storage);
  }
}

/** Drop tag lists for profile ids no longer in the index. */
export function pruneOrphanProfileTags(validProfileIds: Iterable<string>, storage?: Storage | null): void {
  const valid = new Set(validProfileIds);
  const store = storage === undefined ? getStorage() : storage;
  const index = readProfileGameTags(store);
  let changed = false;
  for (const id of Object.keys(index)) {
    if (!valid.has(id)) {
      delete index[id];
      changed = true;
    }
  }
  if (changed) persistProfileGameTags(index, store);
}

/** Sync all profile tag lists from embedded snapshot libraryGameIds (after full index replace). */
export function syncAllLibraryTagsFromSnapshots(
  profiles: Record<string, { libraryGameIds?: string[] }>,
  storage?: Storage | null,
): void {
  const store = storage === undefined ? getStorage() : storage;
  const index: ProfileGameTagIndex = {};
  for (const [id, snapshot] of Object.entries(profiles)) {
    const sanitized = sanitizeLibraryGameIds(snapshot.libraryGameIds);
    if (sanitized) index[id] = sanitized;
  }
  persistProfileGameTags(index, store);
}

/** Remove all game tags for a deleted profile slot. */
export function pruneProfileGameTags(profileId: string, storage?: Storage | null): void {
  if (!profileId) return;
  const store = storage === undefined ? getStorage() : storage;
  const index = readProfileGameTags(store);
  if (!(profileId in index)) return;
  delete index[profileId];
  persistProfileGameTags(index, store);
}

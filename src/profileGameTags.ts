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

/** Remove all game tags for a deleted profile slot. */
export function pruneProfileGameTags(profileId: string, storage?: Storage | null): void {
  if (!profileId) return;
  const store = storage === undefined ? getStorage() : storage;
  const index = readProfileGameTags(store);
  if (!(profileId in index)) return;
  delete index[profileId];
  persistProfileGameTags(index, store);
}

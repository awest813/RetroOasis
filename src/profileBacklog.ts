/**
 * profileBacklog.ts - Per-profile play-later queues.
 */

export const PROFILE_BACKLOG_KEY = "retro-oasis.profile.backlog";

export type ProfileBacklogIndex = Record<string, string[]>;

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch { /* private mode */ }
  return null;
}

function persistProfileBacklog(index: ProfileBacklogIndex, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(PROFILE_BACKLOG_KEY, JSON.stringify(index));
  } catch { /* quota */ }
}

export function sanitizeBacklogGameIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128);
  if (ids.length === 0) return undefined;
  return [...new Set(ids)].slice(0, 10_000);
}

export function readProfileBacklog(storage: Storage | null = getStorage()): ProfileBacklogIndex {
  if (!storage) return {};
  try {
    const raw = storage.getItem(PROFILE_BACKLOG_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: ProfileBacklogIndex = {};
    for (const [profileId, ids] of Object.entries(parsed as Record<string, unknown>)) {
      const sanitized = sanitizeBacklogGameIds(ids);
      if (sanitized) out[profileId] = sanitized;
    }
    return out;
  } catch {
    return {};
  }
}

export function getBacklogGameIds(profileId: string, storage?: Storage | null): ReadonlySet<string> {
  const index = readProfileBacklog(storage === undefined ? getStorage() : storage);
  return new Set(index[profileId] ?? []);
}

export function isGameInProfileBacklog(gameId: string, profileId: string, storage?: Storage | null): boolean {
  if (!gameId || !profileId) return false;
  return getBacklogGameIds(profileId, storage).has(gameId);
}

export function setGameBacklogStatus(
  gameId: string,
  profileId: string,
  inBacklog: boolean,
  storage?: Storage | null,
): void {
  const trimmedId = profileId.trim();
  if (!gameId || !trimmedId) return;
  const store = storage === undefined ? getStorage() : storage;
  const index = readProfileBacklog(store);
  const list = new Set(index[trimmedId] ?? []);
  if (inBacklog) list.add(gameId);
  else list.delete(gameId);
  if (list.size === 0) delete index[trimmedId];
  else index[trimmedId] = [...list];
  persistProfileBacklog(index, store);
}

export function toggleGameBacklogStatus(gameId: string, profileId: string, storage?: Storage | null): boolean {
  const next = !isGameInProfileBacklog(gameId, profileId, storage);
  setGameBacklogStatus(gameId, profileId, next, storage);
  return next;
}

export function syncBacklogForProfile(
  profileId: string,
  gameIds: string[] | undefined,
  storage?: Storage | null,
): void {
  const trimmedId = profileId.trim();
  if (!trimmedId) return;
  const store = storage === undefined ? getStorage() : storage;
  const index = readProfileBacklog(store);
  const sanitized = sanitizeBacklogGameIds(gameIds);
  if (!sanitized) delete index[trimmedId];
  else index[trimmedId] = sanitized;
  persistProfileBacklog(index, store);
}

export function syncAllBacklogsFromSnapshots(
  profiles: Record<string, { backlogGameIds?: string[] }>,
  storage?: Storage | null,
): void {
  const index: ProfileBacklogIndex = {};
  for (const [id, snapshot] of Object.entries(profiles)) {
    const sanitized = sanitizeBacklogGameIds(snapshot.backlogGameIds);
    if (sanitized) index[id] = sanitized;
  }
  persistProfileBacklog(index, storage === undefined ? getStorage() : storage);
}

export function pruneOrphanBacklogs(validProfileIds: Iterable<string>, storage?: Storage | null): void {
  const valid = new Set(validProfileIds);
  const store = storage === undefined ? getStorage() : storage;
  const index = readProfileBacklog(store);
  let changed = false;
  for (const id of Object.keys(index)) {
    if (!valid.has(id)) {
      delete index[id];
      changed = true;
    }
  }
  if (changed) persistProfileBacklog(index, store);
}

export function pruneProfileBacklog(profileId: string, storage?: Storage | null): void {
  if (!profileId) return;
  const store = storage === undefined ? getStorage() : storage;
  const index = readProfileBacklog(store);
  if (!(profileId in index)) return;
  delete index[profileId];
  persistProfileBacklog(index, store);
}

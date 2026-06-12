import { describe, it, expect, beforeEach } from "vitest";
import {
  tagGameForProfile,
  getTaggedGameIds,
  isGameTaggedToAnyProfile,
  isGameVisibleForProfile,
  readProfileGameTags,
  PROFILE_GAME_TAGS_KEY,
} from "./profileGameTags.js";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

describe("profileGameTags", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("tags games per profile", () => {
    tagGameForProfile("game-1", "profile-a", storage);
    expect(getTaggedGameIds("profile-a", storage).has("game-1")).toBe(true);
    expect(isGameTaggedToAnyProfile("game-1", storage)).toBe(true);
    expect(storage.getItem(PROFILE_GAME_TAGS_KEY)).toContain("profile-a");
  });

  it("filters visible games when enabled", () => {
    tagGameForProfile("kid-game", "kids", storage);
    tagGameForProfile("work-game", "work", storage);

    expect(isGameVisibleForProfile("legacy-game", "kids", true, storage)).toBe(true);
    expect(isGameVisibleForProfile("kid-game", "kids", true, storage)).toBe(true);
    expect(isGameVisibleForProfile("work-game", "kids", true, storage)).toBe(false);
    expect(isGameVisibleForProfile("work-game", "kids", false, storage)).toBe(true);
  });

  it("reads empty index when storage is missing", () => {
    expect(readProfileGameTags(null)).toEqual({});
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PROFILE_INDEX_STORAGE_KEY } from "./profileManager.js";
import {
  pushProfileIndexToCloud,
  pullProfileIndexFromCloud,
  readLocalProfileIndexRaw,
} from "./profileCloudSync.js";

const indexJson = JSON.stringify({
  version: 1,
  activeId: "a",
  profiles: { a: { meta: { id: "a", name: "A", createdAt: 1, updatedAt: 1 }, snapshot: {} } },
});

vi.mock("./cloudSaveSingleton.js", () => ({
  getCloudSaveManager: () => ({
    isConnected: () => true,
    providerId: "webdav",
    loadWebDAVConfig: () => ({
      url: "https://dav.example.com/saves",
      username: "user",
      password: "pass",
    }),
    loadNextcloudConfig: () => null,
  }),
}));

describe("profileCloudSync", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads local profile index", () => {
    const storage = {
      getItem: vi.fn(() => indexJson),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: () => null,
    } satisfies Storage;
    expect(readLocalProfileIndexRaw(storage)).toBe(indexJson);
    expect(storage.getItem).toHaveBeenCalledWith(PROFILE_INDEX_STORAGE_KEY);
  });

  it("uploads profile index via WebDAV PUT", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response("", { status: 201 }));
    const err = await pushProfileIndexToCloud(indexJson);
    expect(err).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(putCall).toBeTruthy();
  });

  it("downloads profile index via WebDAV GET", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(indexJson, { status: 200 }));
    const remote = await pullProfileIndexFromCloud();
    expect(remote).toBe(indexJson);
  });
});

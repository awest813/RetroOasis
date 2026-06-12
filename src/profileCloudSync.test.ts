import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PROFILE_INDEX_STORAGE_KEY } from "./profileManager.js";

const indexJson = JSON.stringify({
  version: 1,
  activeId: "a",
  profiles: { a: { meta: { id: "a", name: "A", createdAt: 1, updatedAt: 1 }, snapshot: {} } },
});

let mockProviderId: "webdav" | "gdrive" = "webdav";

vi.mock("./cloudSaveSingleton.js", () => ({
  getCloudSaveManager: () => ({
    isConnected: () => true,
    providerId: mockProviderId,
    loadWebDAVConfig: () => mockProviderId === "webdav"
      ? { url: "https://dav.example.com/saves", username: "user", password: "pass" }
      : null,
    loadNextcloudConfig: () => null,
    loadGDriveConfig: () => mockProviderId === "gdrive" ? { accessToken: "tok" } : null,
    loadDropboxConfig: () => null,
  }),
}));

import {
  pushProfileIndexToCloud,
  pullProfileIndexFromCloud,
  readLocalProfileIndexRaw,
} from "./profileCloudSync.js";

describe("profileCloudSync", () => {
  beforeEach(() => {
    mockProviderId = "webdav";
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
    expect(remote.ok).toBe(true);
    if (remote.ok) expect(remote.raw).toBe(indexJson);
  });

  it("reports missing backup separately from auth failures", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    const missing = await pullProfileIndexFromCloud();
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain("No profile backup");

    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    const auth = await pullProfileIndexFromCloud();
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.error).toContain("authentication failed");
  });

  it("uploads profile index to Google Drive appDataFolder", async () => {
    mockProviderId = "gdrive";
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    const err = await pushProfileIndexToCloud(indexJson);
    expect(err).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
  });
});

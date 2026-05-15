import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  requestPersistentStorage,
  isStoragePersistent,
  checkStorageQuota,
  getStorageWarning,
  checkSpaceForOperation,
  startStorageMonitoring,
  stopStorageMonitoring,
  installStoragePressureListener,
  _resetStorageStateForTests,
} from "./storage.js";

// ── requestPersistentStorage ───────────────────────────────────────────────────

describe("requestPersistentStorage", () => {
  beforeEach(() => { _resetStorageStateForTests(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns true when persist() resolves to true", async () => {
    vi.stubGlobal("navigator", {
      storage: { persist: vi.fn().mockResolvedValue(true) },
    });
    const result = await requestPersistentStorage();
    expect(result).toBe(true);
    expect(isStoragePersistent()).toBe(true);
  });

  it("returns false when persist() resolves to false", async () => {
    vi.stubGlobal("navigator", {
      storage: { persist: vi.fn().mockResolvedValue(false) },
    });
    const result = await requestPersistentStorage();
    expect(result).toBe(false);
    expect(isStoragePersistent()).toBe(false);
  });

  it("returns false when navigator.storage.persist is unavailable", async () => {
    vi.stubGlobal("navigator", { storage: {} });
    const result = await requestPersistentStorage();
    expect(result).toBe(false);
  });

  it("caches the result and does not call persist() twice", async () => {
    const persistMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", { storage: { persist: persistMock } });

    await requestPersistentStorage();
    await requestPersistentStorage();
    expect(persistMock).toHaveBeenCalledTimes(1);
  });
});

// ── checkStorageQuota ─────────────────────────────────────────────────────────

describe("checkStorageQuota", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns quota data from the Storage Manager API", async () => {
    vi.stubGlobal("navigator", {
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 500_000_000, quota: 2_000_000_000 }),
      },
    });
    const result = await checkStorageQuota();
    expect(result.usedBytes).toBe(500_000_000);
    expect(result.quotaBytes).toBe(2_000_000_000);
    expect(result.percentUsed).toBe(25); // 500M / 2000M = 25%
    expect(result.isLow).toBe(false);    // 1500M remaining > 500M threshold
  });

  it("detects low storage when remaining space < 500 MB", async () => {
    vi.stubGlobal("navigator", {
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 1_900_000_000, quota: 2_000_000_000 }),
      },
    });
    const result = await checkStorageQuota();
    expect(result.isLow).toBe(true);
  });

  it("returns null percentUsed when quota is unavailable", async () => {
    vi.stubGlobal("navigator", {
      storage: { estimate: vi.fn().mockResolvedValue({ usage: 500_000_000, quota: 0 }) },
    });
    const result = await checkStorageQuota();
    expect(result.percentUsed).toBeNull();
  });

  it("handles estimate() throwing gracefully", async () => {
    vi.stubGlobal("navigator", {
      storage: { estimate: vi.fn().mockRejectedValue(new Error("quota exceeded")) },
    });
    const result = await checkStorageQuota();
    expect(result.usedBytes).toBe(0);
    expect(result.quotaBytes).toBeNull();
  });
});

// ── getStorageWarning ────────────────────────────────────────────────────────

describe("getStorageWarning", () => {
  it("returns null when not low", () => {
    const quota = {
      usedBytes: 500_000_000,
      quotaBytes: 2_000_000_000,
      percentUsed: 25,
      isPersistent: true,
      isLow: false,
    };
    expect(getStorageWarning(quota)).toBeNull();
  });

  it("returns a warning when critically low (<100 MB)", () => {
    const quota = {
      usedBytes: 1_950_000_000,
      quotaBytes: 2_000_000_000,
      percentUsed: 97,
      isPersistent: false,
      isLow: true,
    };
    const warning = getStorageWarning(quota);
    expect(warning).not.toBeNull();
    expect(warning!.message).toContain("Critically low");
    expect(warning!.remainingBytes).toBe(50_000_000);
  });

  it("returns null when quotaBytes is null", () => {
    const quota = {
      usedBytes: 1_000_000_000,
      quotaBytes: null,
      percentUsed: null,
      isPersistent: false,
      isLow: true,
    };
    expect(getStorageWarning(quota)).toBeNull();
  });
});

// ── checkSpaceForOperation ───────────────────────────────────────────────────

describe("checkSpaceForOperation", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns null when there is enough space", async () => {
    vi.stubGlobal("navigator", {
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 500_000_000, quota: 2_000_000_000 }),
      },
    });
    const result = await checkSpaceForOperation(100_000_000);
    expect(result).toBeNull();
  });

  it("returns a warning when there is not enough space", async () => {
    vi.stubGlobal("navigator", {
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 1_500_000_000, quota: 2_000_000_000 }),
      },
    });
    const result = await checkSpaceForOperation(600_000_000);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Not enough storage space");
  });
});

// ── startStorageMonitoring ────────────────────────────────────────────────────

describe("startStorageMonitoring", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    stopStorageMonitoring();
  });

  it("calls onLowStorage when quota is low", async () => {
    const onLow = vi.fn();
    vi.stubGlobal("navigator", {
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 1_900_000_000, quota: 2_000_000_000 }),
      },
    });

    startStorageMonitoring(onLow);

    // Wait for the initial check to complete
    await vi.waitFor(() => expect(onLow).toHaveBeenCalled(), { timeout: 1000 });
  });
});

// ── installStoragePressureListener ────────────────────────────────────────────

describe("installStoragePressureListener", () => {
  beforeEach(() => { _resetStorageStateForTests(); });
  afterEach(() => { vi.restoreAllMocks(); });
  it("installs a storage-pressure event listener", () => {
    const addEventListenerMock = vi.fn();
    vi.stubGlobal("window", { addEventListener: addEventListenerMock });

    installStoragePressureListener();

    expect(addEventListenerMock).toHaveBeenCalledWith(
      "storage-pressure",
      expect.any(Function),
      expect.objectContaining({ once: false }),
    );
  });

  it("is idempotent", () => {
    const addEventListenerMock = vi.fn();
    vi.stubGlobal("window", { addEventListener: addEventListenerMock });

    installStoragePressureListener();
    installStoragePressureListener();

    expect(addEventListenerMock).toHaveBeenCalledTimes(1);
  });
});

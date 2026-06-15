import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import {
  _resetScanHandleStoreForTests,
  clearScanRecord,
  loadScanRecord,
  saveScanRecord,
  verifyHandlePermission,
} from "./scanHandleStore.js";

// A stand-in for a FileSystemDirectoryHandle: a structured-cloneable object.
function fakeHandle(name: string) {
  return { name, kind: "directory" as const };
}

describe("scanHandleStore", () => {
  beforeEach(async () => {
    _resetScanHandleStoreForTests();
    indexedDB.deleteDatabase("retro-oasis-scan");
    await new Promise((r) => setTimeout(r, 0));
  });
  afterEach(() => _resetScanHandleStoreForTests());

  it("returns null when nothing is saved", async () => {
    expect(await loadScanRecord()).toBeNull();
  });

  it("round-trips a saved record", async () => {
    await saveScanRecord(fakeHandle("MyRoms"), "MyRoms", ["sig-a", "sig-b"]);
    const record = await loadScanRecord();
    expect(record?.name).toBe("MyRoms");
    expect(record?.signatures).toEqual(["sig-a", "sig-b"]);
    expect((record?.handle as { name: string }).name).toBe("MyRoms");
    expect(typeof record?.lastScanAt).toBe("number");
  });

  it("replaces the previous record (single slot)", async () => {
    await saveScanRecord(fakeHandle("A"), "A", ["1"]);
    await saveScanRecord(fakeHandle("B"), "B", ["2"]);
    const record = await loadScanRecord();
    expect(record?.name).toBe("B");
  });

  it("clears the saved record", async () => {
    await saveScanRecord(fakeHandle("A"), "A", ["1"]);
    await clearScanRecord();
    expect(await loadScanRecord()).toBeNull();
  });
});

describe("verifyHandlePermission", () => {
  it("returns false for handles without the permission API", async () => {
    expect(await verifyHandlePermission(null)).toBe(false);
    expect(await verifyHandlePermission({ name: "x" })).toBe(false);
  });

  it("returns true when permission is already granted", async () => {
    const handle = { queryPermission: async () => "granted" as PermissionState };
    expect(await verifyHandlePermission(handle)).toBe(true);
  });

  it("requests permission when not yet granted", async () => {
    let requested = false;
    const handle = {
      queryPermission: async () => "prompt" as PermissionState,
      requestPermission: async () => { requested = true; return "granted" as PermissionState; },
    };
    expect(await verifyHandlePermission(handle)).toBe(true);
    expect(requested).toBe(true);
  });

  it("returns false when permission is denied", async () => {
    const handle = {
      queryPermission: async () => "prompt" as PermissionState,
      requestPermission: async () => "denied" as PermissionState,
    };
    expect(await verifyHandlePermission(handle)).toBe(false);
  });
});

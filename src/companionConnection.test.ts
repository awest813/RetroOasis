import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCompanionConfig,
  connectCompanion,
  disconnectCompanion,
  getActiveCompanionSource,
  getCompanionConfig,
  restoreCompanionConnection,
  saveCompanionConfig,
  testCompanionConnection,
  _resetCompanionConnectionForTests,
} from "./companionConnection.js";
import { getLibraryRegistry, _resetLibraryRegistryForTests } from "./librarySource.js";

function okFetch() {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ version: 1, games: [] }),
    blob: async () => new Blob(),
  } as unknown as Response));
}

beforeEach(() => {
  localStorage.clear();
  _resetLibraryRegistryForTests();
  _resetCompanionConnectionForTests();
});

describe("companion config persistence", () => {
  it("returns null when nothing is saved", () => {
    expect(getCompanionConfig()).toBeNull();
  });

  it("round-trips and clears config", () => {
    saveCompanionConfig({ url: "http://server", token: "t" });
    expect(getCompanionConfig()).toEqual({ url: "http://server", token: "t" });
    clearCompanionConfig();
    expect(getCompanionConfig()).toBeNull();
  });

  it("ignores malformed stored config", () => {
    localStorage.setItem("retrooasis.companion", "{not json");
    expect(getCompanionConfig()).toBeNull();
  });
});

describe("connect / disconnect", () => {
  it("registers a companion source in the registry and saves config", () => {
    connectCompanion({ url: "http://server" }, { fetchImpl: okFetch() });
    expect(getActiveCompanionSource()?.id).toBe("companion:http://server");
    expect(getLibraryRegistry().has("companion:http://server")).toBe(true);
    expect(getCompanionConfig()?.url).toBe("http://server");
  });

  it("replaces a prior source on reconnect", () => {
    connectCompanion({ url: "http://a" }, { fetchImpl: okFetch() });
    connectCompanion({ url: "http://b" }, { fetchImpl: okFetch() });
    expect(getLibraryRegistry().has("companion:http://a")).toBe(false);
    expect(getLibraryRegistry().has("companion:http://b")).toBe(true);
  });

  it("unregisters on disconnect", () => {
    connectCompanion({ url: "http://server" }, { fetchImpl: okFetch() });
    disconnectCompanion();
    expect(getActiveCompanionSource()).toBeNull();
    expect(getLibraryRegistry().has("companion:http://server")).toBe(false);
  });
});

describe("testCompanionConnection", () => {
  it("reports success with a game count", async () => {
    const result = await testCompanionConnection({ url: "http://server" }, { fetchImpl: okFetch() });
    expect(result).toEqual({ ok: true, gameCount: 0 });
  });

  it("reports failure without throwing", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("offline"); });
    const result = await testCompanionConnection({ url: "http://server" }, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/offline/);
  });
});

describe("restoreCompanionConnection", () => {
  it("returns null when no config is saved", () => {
    expect(restoreCompanionConnection()).toBeNull();
  });

  it("re-registers from saved config", () => {
    saveCompanionConfig({ url: "http://server" });
    const source = restoreCompanionConnection({ fetchImpl: okFetch() });
    expect(source?.id).toBe("companion:http://server");
    expect(getLibraryRegistry().has("companion:http://server")).toBe(true);
  });
});

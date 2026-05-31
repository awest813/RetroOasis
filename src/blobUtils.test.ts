import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFileFromBlob, readBlobAsArrayBuffer, readBlobAsText } from "./blobUtils.js";

describe("blobUtils mobile compatibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("falls back to FileReader when Blob.arrayBuffer is unavailable", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const original = Blob.prototype.arrayBuffer;
    Object.defineProperty(Blob.prototype, "arrayBuffer", {
      value: undefined,
      configurable: true,
    });

    try {
      const bytes = new Uint8Array(await readBlobAsArrayBuffer(blob));
      expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    } finally {
      Object.defineProperty(Blob.prototype, "arrayBuffer", {
        value: original,
        configurable: true,
      });
    }
  });

  it("falls back to FileReader when Blob.text is unavailable", async () => {
    const blob = new Blob(["cue text"]);
    const original = Blob.prototype.text;
    Object.defineProperty(Blob.prototype, "text", {
      value: undefined,
      configurable: true,
    });

    try {
      await expect(readBlobAsText(blob)).resolves.toBe("cue text");
    } finally {
      Object.defineProperty(Blob.prototype, "text", {
        value: original,
        configurable: true,
      });
    }
  });

  it("creates a named blob fallback when File construction is unavailable", () => {
    class ThrowingFile {
      constructor() {
        throw new TypeError("File constructor unavailable");
      }
    }
    vi.stubGlobal("File", ThrowingFile);

    const file = makeFileFromBlob(new Blob(["rom"], { type: "application/octet-stream" }), "game.gba");

    expect(file.name).toBe("game.gba");
    expect(file.type).toBe("application/octet-stream");
    expect(file).toBeInstanceOf(Blob);
  });
});

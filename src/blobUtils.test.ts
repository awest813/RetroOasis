import { afterEach, describe, expect, it, vi } from "vitest";
import {
  makeFileFromBlob,
  prepareLaunchFile,
  readBlobAsArrayBuffer,
  readBlobAsText,
} from "./blobUtils.js";

describe("blobUtils mobile compatibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("falls back to FileReader when Blob.arrayBuffer rejects a stale WebKit blob", async () => {
    const blob = new Blob([new Uint8Array([4, 5, 6])]);
    const original = Blob.prototype.arrayBuffer;
    Object.defineProperty(Blob.prototype, "arrayBuffer", {
      value() {
        return Promise.reject(new DOMException("The object can not be found here.", "NotFoundError"));
      },
      configurable: true,
    });

    try {
      const bytes = new Uint8Array(await readBlobAsArrayBuffer(blob));
      expect(bytes).toEqual(new Uint8Array([4, 5, 6]));
    } finally {
      Object.defineProperty(Blob.prototype, "arrayBuffer", {
        value: original,
        configurable: true,
      });
    }
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

  it("falls back to FileReader when Blob.text rejects a stale WebKit blob", async () => {
    const blob = new Blob(["stale cue"]);
    const original = Blob.prototype.text;
    Object.defineProperty(Blob.prototype, "text", {
      value() {
        return Promise.reject(new DOMException("The object can not be found here.", "NotFoundError"));
      },
      configurable: true,
    });

    try {
      await expect(readBlobAsText(blob)).resolves.toBe("stale cue");
    } finally {
      Object.defineProperty(Blob.prototype, "text", {
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

  it("prepareLaunchFile reuses an existing File when the name matches", async () => {
    const file = new File(["rom"], "game.gba", { type: "application/octet-stream" });
    await expect(prepareLaunchFile(file, "game.gba")).resolves.toBe(file);
  });

  it("prepareLaunchFile wraps blobs without eagerRead", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "application/octet-stream" });
    const file = await prepareLaunchFile(blob, "game.gba");
    expect(file.name).toBe("game.gba");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("prepareLaunchFile copies bytes when eagerRead is set", async () => {
    const payload = new Uint8Array([0x4e, 0x45, 0x53, 0x1a]);
    const picked = new File([payload], "game.nes");
    const materialised = await prepareLaunchFile(picked, "game.nes", { eagerRead: true });
    expect(materialised).not.toBe(picked);
    expect(new Uint8Array(await materialised.arrayBuffer())).toEqual(payload);
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

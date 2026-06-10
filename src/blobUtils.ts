/**
 * Blob/File compatibility helpers for mobile WebKit browsers.
 *
 * Modern browsers expose Blob.arrayBuffer(), Blob.text(), and File(...), but
 * older iOS WebViews and Chrome-on-iOS shells can be partial. Keep the ROM
 * loading path tolerant by falling back to APIs that have existed longer.
 *
 * `prepareLaunchFile()` is the canonical hand-off for EmulatorJS: it returns a
 * `File` so the core uses its direct `arrayBuffer()` path instead of `fetch()`.
 */

export interface PrepareLaunchFileOptions {
  /**
   * Eagerly read the blob into a fresh in-memory `File`.
   * Required on WebKit where deferred reads from picker/IDB handles can fail.
   */
  eagerRead?: boolean;
}

/** WebKit throws this when an IndexedDB-backed blob handle is stale. */
function isStaleWebKitBlobError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const name = "name" in err ? String((err as { name: unknown }).name) : "";
    if (name === "NotFoundError") return true;
    const message = "message" in err ? String((err as { message: unknown }).message) : "";
    if (/object can not be found/i.test(message)) return true;
  }
  return false;
}

function readBlobViaFileReader(
  blob: Blob,
  read: (reader: FileReader) => void,
): Promise<ArrayBuffer | string> {
  if (typeof FileReader === "undefined") {
    return Promise.reject(new Error("Could not read file."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer || typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read file."));
    };
    try {
      read(reader);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export function makeFileFromBlob(
  blob: Blob,
  fileName: string,
  options: FilePropertyBag = {},
): File {
  if (typeof File !== "undefined" && blob instanceof File && blob.name === fileName) return blob;

  try {
    return new File([blob], fileName, {
      type: options.type ?? blob.type,
      lastModified: options.lastModified,
    });
  } catch {
    const fallback = new Blob([blob], { type: options.type ?? blob.type }) as File;
    Object.defineProperties(fallback, {
      name: { value: fileName, configurable: true },
      lastModified: { value: options.lastModified ?? Date.now(), configurable: true },
      webkitRelativePath: { value: "", configurable: true },
    });
    return fallback;
  }
}

/**
 * Normalize a ROM blob for EmulatorJS launch.
 *
 * When `eagerRead` is set, copies bytes into a new `File` so later async reads
 * (after dialogs, archive work, or a second launch) cannot stall on WebKit.
 */
export async function prepareLaunchFile(
  blob: Blob,
  fileName: string,
  options: PrepareLaunchFileOptions = {},
): Promise<File> {
  const mime = blob.type || "application/octet-stream";

  if (options.eagerRead) {
    const romBuf = await readBlobAsArrayBuffer(blob);
    return makeFileFromBlob(new Blob([romBuf], { type: mime }), fileName, { type: mime });
  }

  if (blob instanceof File && blob.name === fileName) return blob;
  return makeFileFromBlob(blob, fileName, { type: mime });
}

export function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer().catch((err: unknown) => {
      if (!isStaleWebKitBlobError(err)) throw err;
      return readBlobViaFileReader(blob, (reader) => reader.readAsArrayBuffer(blob)).then((result) => {
        if (result instanceof ArrayBuffer) return result;
        throw new Error("Could not read file as bytes.");
      });
    });
  }

  if (typeof FileReader !== "undefined") {
    return readBlobViaFileReader(blob, (reader) => reader.readAsArrayBuffer(blob)).then((result) => {
      if (result instanceof ArrayBuffer) return result;
      throw new Error("Could not read file as bytes.");
    });
  }

  return new Response(blob).arrayBuffer();
}

export function readBlobAsText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") {
    return blob.text().catch((err: unknown) => {
      if (!isStaleWebKitBlobError(err)) throw err;
      return readBlobViaFileReader(blob, (reader) => reader.readAsText(blob)).then((result) => {
        if (typeof result === "string") return result;
        throw new Error("Could not read file as text.");
      });
    });
  }

  if (typeof FileReader !== "undefined") {
    return readBlobViaFileReader(blob, (reader) => reader.readAsText(blob)).then((result) => {
      if (typeof result === "string") return result;
      throw new Error("Could not read file as text.");
    });
  }

  return new Response(blob).text();
}

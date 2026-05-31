/**
 * Blob/File compatibility helpers for mobile WebKit browsers.
 *
 * Modern browsers expose Blob.arrayBuffer(), Blob.text(), and File(...), but
 * older iOS WebViews and Chrome-on-iOS shells can be partial. Keep the ROM
 * loading path tolerant by falling back to APIs that have existed longer.
 */

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

export function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer();
  }

  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
          return;
        }
        reject(new Error("Could not read file as bytes."));
      };
      reader.readAsArrayBuffer(blob);
    });
  }

  return new Response(blob).arrayBuffer();
}

export function readBlobAsText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") {
    return blob.text();
  }

  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }
        reject(new Error("Could not read file as text."));
      };
      reader.readAsText(blob);
    });
  }

  return new Response(blob).text();
}

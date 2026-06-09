/**
 * archiveFiling.ts — libarchive WASM extraction via the filing package.
 *
 * Primary path for 7z/RAR in archive.ts; falls back to legacy workers on failure.
 */
import { FilingBrowserWorker } from "filing";
import filingWasmUrl from "filing/dist/esm/wasm/archive.wasm?url";

export interface FilingExtractedEntry {
  name: string;
  bytes: Uint8Array;
}

let filingWorker: FilingBrowserWorker | null = null;

function getFilingWorker(): FilingBrowserWorker {
  if (!filingWorker) {
    filingWorker = new FilingBrowserWorker({ wasmUrl: filingWasmUrl });
  }
  return filingWorker;
}

/** Reset the singleton worker (tests). */
export function resetFilingWorkerForTests(): void {
  filingWorker = null;
}

/**
 * Extract archive members using filing/libarchive WASM in a Web Worker.
 */
export async function extractArchiveWithFiling(blob: Blob): Promise<FilingExtractedEntry[]> {
  const filing = getFilingWorker();
  const extracted = await filing.extract(blob);
  const entries: FilingExtractedEntry[] = [];

  for (const item of extracted) {
    const pathname = item.pathname?.replace(/\\/g, "/") ?? "";
    if (!pathname || pathname.endsWith("/")) continue;

    const file = item.file;
    if (!(file instanceof Blob) || file.size === 0) continue;

    entries.push({
      name: pathname,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }

  return entries;
}

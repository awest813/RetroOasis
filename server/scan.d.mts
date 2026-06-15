/** Type declarations for the reference companion server scanner (scan.mjs). */

export interface CompanionGame {
  id: string;
  name: string;
  fileName: string;
  systemId: string;
  size: number;
  contentHash?: string;
  hasCover?: boolean;
  addedAt?: number;
}

export interface ScanResult {
  games: CompanionGame[];
  byId: Map<string, { absPath: string; game: CompanionGame }>;
}

export interface ScanFsLike {
  readdir(dir: string, opts: { withFileTypes: true }): Promise<Array<{
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }>>;
  stat(p: string): Promise<{ size: number; mtimeMs?: number }>;
}

export interface ScanOptions {
  fs?: ScanFsLike;
  hash?: (relPath: string, size: number) => string;
}

export function inferSystem(relPath: string): string | null;
export function defaultHash(relPath: string, size: number): string;
export function scanRoms(rootDir: string, opts?: ScanOptions): Promise<ScanResult>;
export function buildLibraryResponse(scan: ScanResult): { version: 1; games: CompanionGame[] };

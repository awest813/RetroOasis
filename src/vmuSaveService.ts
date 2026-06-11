/**
 * vmuSaveService.ts — Capture and restore Dreamcast VMU files via the emulator VFS.
 */

import type { CoreBridge } from "./emulator.js";
import { isDreamcastVmuFileName } from "./dreamcastCore.js";
import { VmuSaveLibrary } from "./vmuSaves.js";

const VFS_SAVES_DIR = "/data/saves";

export interface VmuSaveRuntime {
  bridge: CoreBridge | null;
  flushInGameSaves(): void;
  reloadInGameSaves(): void;
}

export interface VmuSaveServiceOptions {
  vmuLibrary: VmuSaveLibrary;
  emulator: VmuSaveRuntime;
}

export class VmuSaveService {
  private readonly vmuLibrary: VmuSaveLibrary;
  private readonly emulator: VmuSaveRuntime;

  constructor(opts: VmuSaveServiceOptions) {
    this.vmuLibrary = opts.vmuLibrary;
    this.emulator = opts.emulator;
  }

  async captureForGame(gameId: string): Promise<number> {
    this.emulator.flushInGameSaves();
    const files = await this.readVmuFilesFromVfs();
    return this.vmuLibrary.upsertFiles(gameId, files);
  }

  async restoreForGame(gameId: string): Promise<boolean> {
    const stored = await this.vmuLibrary.getFilesForGame(gameId);
    if (stored.size === 0) return false;
    return this.writeVmuFilesToVfs(stored, false);
  }

  async reloadInGameSaves(): Promise<void> {
    this.emulator.reloadInGameSaves();
  }

  private async readVmuFilesFromVfs(): Promise<Map<string, Uint8Array>> {
    const bridge = this.emulator.bridge;
    const out = new Map<string, Uint8Array>();
    if (!bridge?.isReady) return out;

    try {
      if (!bridge.fs.exists(VFS_SAVES_DIR)) return out;
      for (const name of bridge.fs.readdir(VFS_SAVES_DIR)) {
        if (name === "." || name === ".." || !isDreamcastVmuFileName(name)) continue;
        const data = await bridge.readFileAsync(`${VFS_SAVES_DIR}/${name}`);
        if (data && data.byteLength > 0) out.set(name, data);
      }
    } catch {
      return out;
    }

    return out;
  }

  private async writeVmuFilesToVfs(
    files: ReadonlyMap<string, Uint8Array>,
    reload: boolean,
  ): Promise<boolean> {
    const bridge = this.emulator.bridge;
    if (!bridge?.isReady || files.size === 0) return false;

    try {
      bridge.fs.mkdir(VFS_SAVES_DIR);
      for (const [fileName, data] of files) {
        const ok = await bridge.writeFileAsync(`${VFS_SAVES_DIR}/${fileName}`, data);
        if (!ok) return false;
      }
      if (reload) this.emulator.reloadInGameSaves();
      return true;
    } catch {
      return false;
    }
  }
}

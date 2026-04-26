/**
 * LanemuService.ts — Facade for controlling the LANemu backend.
 */

import { LanemuProcessService, type IProcessLaunchService } from "./LanemuProcessService.js";
import { LanemuNetworkService, type INetworkService } from "./LanemuNetworkService.js";
import type { LanemuSettings } from "./LanemuSettings.js";
import type { LanemuStatus } from "./LanemuStatus.js";

export class LanemuService {
  private _proc: LanemuProcessService;
  private _net:  LanemuNetworkService;
  private _settings: LanemuSettings;
  private _listeners: Array<(status: LanemuStatus) => void> = [];

  constructor(
    settings:  LanemuSettings,
    launcher:  IProcessLaunchService,
    network:   INetworkService
  ) {
    this._settings = settings;
    this._proc     = new LanemuProcessService(launcher);
    this._net      = new LanemuNetworkService(network);
  }

  onStatusChange(fn: (status: LanemuStatus) => void): () => void {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(l => l !== fn);
    };
  }

  private _notify(status: LanemuStatus): void {
    for (const fn of this._listeners) {
      try { fn(status); } catch (err) { console.error("[LanemuService] Listener error:", err); }
    }
  }

  async getStatus(): Promise<LanemuStatus> {
    const isRunning = await this._proc.checkAlive();
    const virtualIp = isRunning ? await this._net.detectVirtualIp() : null;

    return {
      javaDetected:      true, // TODO: Implement real detection via launcher
      lanemuJarDetected: true, // TODO: Implement real detection via filesystem
      running:           isRunning,
      virtualIp:         virtualIp?.address,
      adapterName:       virtualIp?.name,
      accessFileLoaded:  isRunning, // Simplification for MVP
    };
  }

  async start(options: {
    playerName:      string;
    accessFilePath?: string;
    vpnIp?:          string;
    vpnMask?:        string;
    port?:           number;
  }): Promise<void> {
    const args = ["--headless"];
    if (options.playerName) args.push(`--name=${options.playerName}`);
    if (options.accessFilePath) args.push(`--access=${options.accessFilePath}`);
    if (options.port) args.push(`--port=${options.port}`);
    if (options.vpnIp) args.push(`--vpn.ip=${options.vpnIp}`);
    if (options.vpnMask) args.push(`--vpn.mask=${options.vpnMask}`);

    await this._proc.start(this._settings.javaPath, this._settings.lanemuJarPath, args);
    this._notify(await this.getStatus());
  }

  async stop(): Promise<void> {
    await this._proc.stop();
    this._notify(await this.getStatus());
  }

  async detectVirtualIp(): Promise<string | undefined> {
    const res = await this._net.detectVirtualIp();
    return res?.address;
  }

  async validateSetup(): Promise<LanemuStatus> {
    return this.getStatus();
  }
}

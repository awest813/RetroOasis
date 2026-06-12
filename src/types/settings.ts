import type { PerformanceMode } from "../performance.js";
import type { PostProcessEffect } from "../webgpuPostProcess.js";
import type { NetplayIceServer } from "../store/index.js";

export type CloudProviderId = "gdrive" | "dropbox" | "onedrive" | "pcloud" | "webdav" | "blomp" | "box" | "nextcloud" | "mega";

export interface CloudLibraryConnection {
  id: string;
  provider: CloudProviderId;
  name: string;
  enabled: boolean;
  /** JSON-stringified provider-specific settings (tokens, URLs, etc.) */
  config: string;
}

export interface Settings {
  volume:          number;
  lastGameName:    string | null;
  performanceMode: PerformanceMode;
  /** Whether to show the FPS overlay while a game is running. */
  showFPS:         boolean;
  /** Whether to show the audio visualiser in the FPS overlay panel. */
  showAudioVis:    boolean;
  /** Whether to prefer WebGPU when available (experimental). */
  useWebGPU:       boolean;
  /** Active WebGPU post-processing effect. */
  postProcessEffect: PostProcessEffect;
  /** Whether to auto-save on tab close / visibility hidden. */
  autoSaveEnabled: boolean;
  /** System-specific core option overrides (libretro keys). */
  coreOptions:     Record<string, string>;
  /** Whether to lock screen orientation to landscape while a game runs. */
  orientationLock: boolean;
  /** Whether the built-in EmulatorJS Netplay feature is enabled. */
  netplayEnabled:  boolean;
  /** WebSocket URL of the EmulatorJS netplay signalling server. */
  netplayServerUrl: string;
  /** Player display name shown to others in a netplay room. Empty means anonymous. */
  netplayUsername: string;
  /**
   * Optional STUN / TURN server list for WebRTC peer connections.
   *
   * When empty (default), consumers fall back to the built-in public STUN
   * defaults.  Mirrored to / from the `RetroOasisStore` `settings` slice
   * so reactive UI can observe changes without prop-drilling.
   */
  netplayIceServers: NetplayIceServer[];
  /** Whether verbose debug logging is written to the browser console. */
  verboseLogging:  boolean;
  /** Configured cloud library sources. */
  cloudLibraries:  CloudLibraryConnection[];
  /**
   * Optional base URL for a self-hosted libretro-image-matching-server instance.
   * When set, cover-art search also queries `/matches/{console}/boxart`.
   */
  libretroMatchingServerUrl: string;
  /**
   * Audio enhancement filter type.
   * `"none"` disables filtering; `"lowpass"` reduces high-frequency crunch
   * common in PSP/N64 audio; `"highpass"` removes low-frequency rumble.
   */
  audioFilterType: "none" | "lowpass" | "highpass";
  /**
   * Audio filter cutoff frequency in Hz (20–20 000).
   * Only used when `audioFilterType` is not `"none"`. Default: 10 000 Hz.
   */
  audioFilterCutoff: number;
  /**
   * UI Visual Fidelity mode.
   * `"auto"`    — default behavior (performance-dependent)
   * `"quality"` — full blurs, animations, and high-res effects
   * `"lite"`    — simplified UI with blurs and heavy animations disabled
   */
  uiMode: "auto" | "quality" | "lite";
  /** Library layout mode: "grid", "list", or "compact". */
  libraryLayout: "grid" | "list" | "compact";
  /** Whether to group games by system in the library. */
  libraryGrouped: boolean;
  /**
   * Whether to record play sessions in the local play-history database.
   * When disabled, no new sessions are written; existing history is unaffected.
   */
  recordPlayHistory: boolean;
  /**
   * When the active system exposes scalable internal resolution (PSP, N64,
   * DS, Dreamcast), allow automatic step-down during sustained low FPS.
   * Per-game graphics profiles can override with `drsEnabled`.
   */
  dynamicResolutionScaling: boolean;
  /**
   * UI scale multiplier (0.8–1.5). Applied via `--ui-scale` CSS variable
   * to the root element so all layout tokens scale proportionally.
   */
  uiScale: number;
  /**
   * When true, the library shows games tagged to the active profile plus
   * untagged legacy games. New imports are tagged to the active profile.
   */
  profileLibraryFilter: boolean;
}

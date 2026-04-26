export const LEGACY_APP_GLOBALS = {
  devConsole: "__retro-oasis",
} as const;

export const LEGACY_STORAGE_KEYS = {
  settings: "retro-oasis-settings",
  capabilitiesSession: "retro-oasis-devcaps-v1",
  shaderCacheDb: "retro-oasis-shaders",
} as const;

export const LEGACY_EVENTS = {
  closeEasyNetplay: "retro-oasis:closeEasyNetplay",
  gameStarted: "retro-oasis:gameStarted",
  installPromptReady: "retro-oasis:installPromptReady",
  openSettings: "retro-oasis:openSettings",
  restartRequired: "retro-oasis:restart-required",
  resumeGame: "retro-oasis:resumeGame",
  returnToLibrary: "retro-oasis:returnToLibrary",
  touchControlsChanged: "retro-oasis:touchControlsChanged",
} as const;

export const LEGACY_PERF_MARKS = {
  coreReady: "retro-oasis:core-ready",
  gameStart: "retro-oasis:game-start",
  launch: "retro-oasis:launch",
  launchToReady: "retro-oasis:launch-to-ready",
  readyToGameStart: "retro-oasis:ready-to-game-start",
} as const;

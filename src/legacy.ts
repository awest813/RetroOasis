export const LEGACY_APP_GLOBALS = {
  devConsole: "__retrovault",
} as const;

export const LEGACY_STORAGE_KEYS = {
  settings: "retrovault-settings",
  capabilitiesSession: "retrovault-devcaps-v1",
  shaderCacheDb: "retrovault-shaders",
} as const;

export const LEGACY_EVENTS = {
  closeEasyNetplay: "retrovault:closeEasyNetplay",
  gameStarted: "retrovault:gameStarted",
  installPromptReady: "retrovault:installPromptReady",
  openSettings: "retrovault:openSettings",
  restartRequired: "retrovault:restart-required",
  resumeGame: "retrovault:resumeGame",
  returnToLibrary: "retrovault:returnToLibrary",
  touchControlsChanged: "retrovault:touchControlsChanged",
} as const;

export const LEGACY_PERF_MARKS = {
  coreReady: "retrovault:core-ready",
  gameStart: "retrovault:game-start",
  launch: "retrovault:launch",
  launchToReady: "retrovault:launch-to-ready",
  readyToGameStart: "retrovault:ready-to-game-start",
} as const;

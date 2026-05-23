import { CloudSaveManager } from "./cloudSave.js";

let _instance: CloudSaveManager | null = null;

/** Single CloudSaveManager for the app so saves, UI, and auto-sync share one connection. */
export function getCloudSaveManager(): CloudSaveManager {
  if (!_instance) _instance = new CloudSaveManager();
  return _instance;
}


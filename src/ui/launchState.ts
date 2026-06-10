/** Tracks whether a game launch is in flight (prevents double-tap races). */

let _launchInProgress = false;

export function isLaunchInProgress(): boolean {
  return _launchInProgress;
}

export function setLaunchInProgress(active: boolean): void {
  _launchInProgress = active;
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("launch-in-progress", active);
    document.documentElement.toggleAttribute("data-launch-busy", active);
  }
}

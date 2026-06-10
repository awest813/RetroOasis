import type { GameMetadata, GameLibrary } from "../library.js";
import type { Settings } from "../types/settings.js";
import { toLaunchFile } from "./gameImportHelpers.js";
import {
  hideLoadingOverlay,
  setLoadingMessage,
  setLoadingSubtitle,
  showLoadingOverlay,
} from "./loadingOverlay.js";
import { isLaunchInProgress, setLaunchInProgress } from "./launchState.js";
import { showError, showInfoToast } from "./toasts.js";

export interface LaunchFromLibraryOpts {
  game: GameMetadata;
  library: GameLibrary;
  settings: Settings;
  onFetchFromCloud: (
    game: GameMetadata,
    settings: Settings,
    libraryForCache?: GameLibrary,
  ) => Promise<Blob>;
  onLaunchGame: (file: File, systemId: string, gameId?: string) => Promise<void>;
}

/** Resolve a library entry to a launchable file and start the game. */
export async function launchGameFromLibrary(opts: LaunchFromLibraryOpts): Promise<void> {
  const { game, library, settings, onFetchFromCloud, onLaunchGame } = opts;

  if (isLaunchInProgress()) {
    showInfoToast("Already starting a game…", "info");
    return;
  }

  setLaunchInProgress(true);
  let handedOffToLauncher = false;

  showLoadingOverlay();
  setLoadingMessage(`Starting ${game.name}…`);
  setLoadingSubtitle("Getting ready to play");

  try {
    let blob = await library.getGameBlob(game.id);
    if (!blob && game.cloudId) {
      setLoadingMessage("Streaming from cloud…");
      setLoadingSubtitle(`Downloading ${game.name} from ${game.cloudId} (Pull & Play)`);
      blob = await onFetchFromCloud(game, settings, library);
    }
    if (!blob) {
      hideLoadingOverlay();
      showError(`"${game.name}" could not be found in your library. Try adding it again.`);
      return;
    }
    await library.markPlayed(game.id);
    handedOffToLauncher = true;
    await onLaunchGame(toLaunchFile(blob, game.fileName), game.systemId, game.id);
  } catch (err) {
    hideLoadingOverlay();
    showError(`Failed to start game: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (!handedOffToLauncher) setLaunchInProgress(false);
  }
}

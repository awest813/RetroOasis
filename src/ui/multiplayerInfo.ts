import { NETPLAY_SUPPORTED_SYSTEM_IDS, SYSTEM_LINK_CAPABILITIES, roomDisplayNameForKey } from "../multiplayerUtils.js";
import { getSystemById } from "../systems.js";
import { resolveNetplayRoomKey } from "../multiplayer.js";
import { createElement as make } from "./dom.js";

export function buildSupportedSystemsSection(appName: string): HTMLElement {
  const section = make("div", { class: "settings-section" });
  section.appendChild(make("h4", { class: "settings-section__title" }, "Supported Systems"));
  section.appendChild(make("p", { class: "settings-help" },
    `${appName} Play Together is available for the systems below. Other systems still run in the app, but online multiplayer is not yet supported there.`
  ));

  const list = make("div", { class: "netplay-sys-list" });
  for (const sysId of NETPLAY_SUPPORTED_SYSTEM_IDS) {
    const sysInfo = getSystemById(sysId);
    const chip = make("span", { class: "sys-chip" }, sysInfo?.shortName ?? sysId.toUpperCase());
    if (sysInfo) chip.title = sysInfo.name;
    list.appendChild(chip);
  }

  section.appendChild(list);
  return section;
}

export function buildCurrentGameCompatibilitySection(opts: {
  appName: string;
  currentGameName?: string | null;
  currentSystemId?: string | null;
}): HTMLElement | null {
  const { appName, currentGameName, currentSystemId } = opts;
  if (!currentGameName || !currentSystemId) return null;

  const section = make("div", { class: "settings-section" });
  section.appendChild(make("h4", { class: "settings-section__title" }, "Current Game"));

  const isNetplaySystem = (NETPLAY_SUPPORTED_SYSTEM_IDS as readonly string[]).includes(currentSystemId);
  const isLinkCapable = SYSTEM_LINK_CAPABILITIES[currentSystemId] === true;

  if (!isNetplaySystem || !isLinkCapable) {
    const sysName = getSystemById(currentSystemId)?.name ?? currentSystemId.toUpperCase();
    section.appendChild(make("p", { class: "settings-help" },
      `This system (${sysName}) does not currently support netplay in this app. ${appName} Play Together isn't available for it yet.`
    ));
    return section;
  }

  const roomKey = resolveNetplayRoomKey(currentGameName, currentSystemId);
  const displayName = roomDisplayNameForKey(roomKey);
  const hasCompatRoom = displayName !== roomKey;

  const gameRow = make("div", { class: "netplay-game-info-row" });
  gameRow.appendChild(make("span", { class: "netplay-game-name" }, currentGameName));
  if (hasCompatRoom) {
    gameRow.appendChild(make("span", { class: "netplay-compat-badge" }, displayName));
  }
  section.appendChild(gameRow);
  section.appendChild(make("p", { class: "settings-help" },
    hasCompatRoom
      ? "This game can share rooms with compatible versions. Players on paired versions will appear in the same lobby."
      : "This game uses a unique room key. Only players with the same ROM will appear in the same lobby."
  ));

  return section;
}

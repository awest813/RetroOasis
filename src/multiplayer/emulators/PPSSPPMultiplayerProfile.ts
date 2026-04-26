/**
 * PPSSPPMultiplayerProfile.ts — Multiplayer settings specifically for PPSSPP.
 */

import type { EmulatorMultiplayerProfile } from "./EmulatorMultiplayerProfile.js";

export const PPSSPP_MULTIPLAYER_PROFILE: EmulatorMultiplayerProfile = {
  emulatorId: "ppsspp",
  displayName: "PPSSPP",
  supportedModes: ["ad-hoc", "lan"],
  defaultPort: 27312,
  hostInstructions: [
    "Enable WLAN / Ad Hoc in PPSSPP Settings.",
    "Start the multiplayer lobby in-game.",
    "Share your LANemu virtual IP with your friend.",
    "Ensure you are using the same game region.",
  ],
  guestInstructions: [
    "Enable WLAN / Ad Hoc in PPSSPP Settings.",
    "Set the Ad Hoc Server Address to the Host's Virtual IP.",
    "Join the same in-game lobby.",
    "Ensure you are using the same game region.",
  ],
};

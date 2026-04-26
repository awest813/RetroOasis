/**
 * EmulatorMultiplayerProfile.ts — Defines how an emulator interacts with LAN multiplayer.
 */

export interface EmulatorMultiplayerProfile {
  emulatorId:     string;
  displayName:    string;
  supportedModes: Array<"lan" | "ad-hoc" | "direct-ip">;
  defaultPort?:   number;
  launchArgs?:    string[];
  hostInstructions: string[];
  guestInstructions: string[];
}

export interface LanemuSettings {
  javaPath: string;
  lanemuJarPath: string;
  defaultPlayerName: string;
  defaultPort: number;
  roomsDirectory: string;
  autoStartLanemu: boolean;
}

export const DEFAULT_LANEMU_SETTINGS: LanemuSettings = {
  javaPath: "java",
  lanemuJarPath: "./tools/lanemu/Lanemu.jar",
  defaultPlayerName: "RetroOasisPlayer",
  defaultPort: 2103,
  roomsDirectory: "./data/lanemu/rooms",
  autoStartLanemu: true,
};

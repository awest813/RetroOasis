/**
 * LanemuRoomProfile.ts — Defines the data model for a saved LANemu room.
 */

export interface LanemuRoomProfile {
  id:             string;
  roomName:       string;
  playerName:     string;
  accessFilePath: string;
  virtualIp?:     string;
  port:           number;
  createdAt:      string;
  lastUsedAt?:    string;
  notes?:         string;
}

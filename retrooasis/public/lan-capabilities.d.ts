export const LAN_PROTOCOL: number
export interface LanCapability {
  label: string
  mode: 'shared-console' | 'linked-consoles'
  maxPlayers: number
  cores: string[]
  buttons: number[]
  analog?: boolean
  maxRom?: number
}
export const LAN_CAPABILITIES: Record<string, LanCapability>
export const LAN_CORES: Set<string>
export const LINK_CAPABILITIES: Record<string, LanCapability>
export const LINK_CORES: Set<string>
export const ROOM_PROFILES: Record<string, LanCapability>
export const CORE_LABELS: Record<string, string>
export function inputIndices(core: string): number[]
export function normalizeStick(x?: number, y?: number, deadZone?: number): [number, number]
export function gamepadControls(pad: Gamepad | null, core: string): { buttons: number[]; stick: [number, number] }

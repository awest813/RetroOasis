export const LAN_PROTOCOL: number
export interface LanCapability {
  label: string
  mode: 'shared-console'
  maxPlayers: number
  cores: string[]
  buttons: number[]
  analog?: boolean
}
export const LAN_CAPABILITIES: Record<string, LanCapability>
export const LAN_CORES: Set<string>
export const CORE_LABELS: Record<string, string>
export function inputIndices(core: string): number[]
export function normalizeStick(x?: number, y?: number, deadZone?: number): [number, number]
export function gamepadControls(pad: Gamepad | null, core: string): { buttons: number[]; stick: [number, number] }

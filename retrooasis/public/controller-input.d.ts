export interface ControllerReading { pads: Gamepad[]; access: 'available' | 'unsupported' | 'blocked' }
export function readControllers(source?: Pick<Navigator, 'getGamepads'>): ControllerReading
export function controllerButton(pad: Gamepad, index: number): boolean
export function controllerAxis(pad: Gamepad, index: number): number
export function controllerNeutral(pad: Gamepad, threshold?: number): boolean
export class ControllerSelector { read(pads: Gamepad[]): Gamepad | null }
export class ControllerGate { reset(): void; read(pad: Gamepad | null, enabled?: boolean): Gamepad | null }

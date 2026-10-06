import { LAN_PROTOCOL, LAN_CORES } from '../../public/lan-capabilities.js'
export { LAN_CORES, LAN_CAPABILITIES, LINK_CORES } from '../../public/lan-capabilities.js'

export interface LanInfo {
  available: true
  addresses: string[]
  secure: boolean
  maxPlayers: number
  protocol: number
  cores: string[]
  /** Handheld link (trade) rooms; absent on servers older than this feature. */
  link?: { ready: boolean; systems: string[] }
}

export type LanServiceResult =
  | { state: 'ready'; info: LanInfo }
  | { state: 'unavailable' | 'unreachable' | 'timeout' | 'incompatible' | 'invalid' }

/** Checks signaling only; the host player checks core assets before creating a room. */
export async function checkLanService(signal?: AbortSignal): Promise<LanServiceResult> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, 2500)
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  try {
    const response = await fetch('./api/lan', { cache: 'no-store', signal: controller.signal })
    if (!response.ok) return { state: response.status === 404 ? 'unavailable' : 'unreachable' }
    // Static SPA hosts often return the app's HTML for unknown API paths.
    if (response.headers.get('content-type')?.includes('text/html')) return { state: 'unavailable' }
    let data
    try { data = await response.json() } catch { return { state: timedOut ? 'timeout' : 'invalid' } }
    if (!data || typeof data !== 'object') return { state: 'invalid' }
    if (data.available !== true) return { state: 'unavailable' }
    if (data.protocol !== LAN_PROTOCOL) return { state: 'incompatible' }
    if (typeof data.secure !== 'boolean' || !Number.isInteger(data.maxPlayers) || data.maxPlayers < 2 || data.maxPlayers > 4 ||
      !Array.isArray(data.addresses) || !data.addresses.every((address: unknown) => typeof address === 'string') ||
      !Array.isArray(data.cores) || !data.cores.every((core: unknown) => typeof core === 'string')) return { state: 'invalid' }
    if (!data.cores.some((core: string) => LAN_CORES.has(core))) return { state: 'incompatible' }
    return { state: 'ready', info: data as LanInfo }
  } catch {
    return { state: timedOut ? 'timeout' : 'unreachable' }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export async function getLanInfo(): Promise<LanInfo | null> {
  const result = await checkLanService()
  return result.state === 'ready' ? result.info : null
}

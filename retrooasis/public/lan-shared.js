import { ROOM_PROFILES, LAN_PROTOCOL, normalizeStick } from './lan-capabilities.js'
export { CORE_LABELS } from './lan-capabilities.js'
export const BUTTONS = { B: 0, Y: 1, Select: 2, Start: 3, Up: 4, Down: 5, Left: 6, Right: 7, A: 8, X: 9, L: 10, R: 11 }

export function status(message, root = document) {
  const target = root.querySelector('[data-lan-status]')
  if (target) target.textContent = message
}
const NICKNAME_KEY = 'retrooasis.lan.nickname'
/** Remembered per device; storage can be unavailable in private windows. */
export function savedNickname(fallback = '') {
  try { return localStorage.getItem(NICKNAME_KEY)?.trim().slice(0, 32) || fallback } catch { return fallback }
}
export function saveNickname(value) {
  try { if (value.trim()) localStorage.setItem(NICKNAME_KEY, value.trim().slice(0, 32)) } catch { /* not persisted */ }
}
/** Accepts a bare room code or a pasted invite link. */
export function roomCodeFrom(value) {
  const text = String(value || '').trim()
  return (/#([a-f0-9]{10})\s*$/i.exec(text)?.[1] || text).toUpperCase()
}
export async function lanInfo() {
  const response = await fetch('./api/lan', { cache: 'no-store', signal: AbortSignal.timeout(4000) })
  if (!response.ok) throw new Error('Start the LAN server on the host computer with npm run oasis:lan.')
  const info = await response.json()
  if (!info.available) throw new Error('LAN room service is unavailable.')
  if (info.protocol !== LAN_PROTOCOL) throw new Error('The room server and app versions differ. Update the host and reload this page.')
  return info
}
export async function connectSocket() {
  if (!window.io) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = '/socket.io/socket.io.js'
      const timer = setTimeout(() => { script.remove(); reject(new Error('LAN room service did not respond.')) }, 5000)
      script.onload = () => { clearTimeout(timer); resolve() }
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Start the LAN server first.')) }
      document.head.append(script)
    })
  }
  const socket = window.io({ transports: ['websocket'], reconnectionAttempts: 5, timeout: 5000 })
  await new Promise((resolve, reject) => {
    const connected = () => { socket.off('connect_error', failed); resolve() }
    const failed = error => { socket.off('connect', connected); socket.disconnect(); reject(new Error(`Cannot connect to the LAN room service: ${error.message}`)) }
    socket.once('connect', connected)
    socket.once('connect_error', failed)
  })
  return socket
}
export function request(socket, event, data = {}) {
  if (event === 'room:create' || event === 'room:join') data = { ...data, protocol: LAN_PROTOCOL }
  if (!socket?.connected) return Promise.reject(new Error('The LAN server is disconnected. Reconnect before trying again.'))
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, data, (error, reply) => {
      if (error) reject(new Error('The LAN server did not respond. Try again.'))
      else if (!reply?.ok) reject(new Error(reply?.error || 'Room request failed.'))
      else resolve(reply)
    })
  })
}
export function createPeer(socket, target, onTrack, onState) {
  const pc = new RTCPeerConnection({ iceServers: [] })
  const queued = []
  let closed = false
  let chain = Promise.resolve()
  pc.onicecandidate = event => {
    if (!closed && socket.connected && event.candidate) socket.emit('room:signal', { target, signal: { candidate: event.candidate.toJSON() } })
  }
  pc.onconnectionstatechange = () => onState?.(pc.connectionState)
  pc.ontrack = event => onTrack?.(event)
  // Serialize negotiation and ICE so candidates never race remote descriptions.
  const accept = signal => {
    chain = chain.then(async () => {
      if (closed) return
      if (signal.description) {
        await pc.setRemoteDescription(signal.description)
        for (const candidate of queued.splice(0)) await pc.addIceCandidate(candidate)
        if (signal.description.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer())
          if (!closed && socket.connected) socket.emit('room:signal', { target, signal: { description: pc.localDescription.toJSON() } })
        }
      } else if (signal.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate)
        else queued.push(signal.candidate)
      }
    }).catch(error => { if (!closed) onState?.('failed', error) })
    return chain
  }
  return { pc, accept, close: () => { closed = true; queued.length = 0; pc.ontrack = null; pc.onicecandidate = null; pc.onconnectionstatechange = null; pc.close() } }
}

/** N64 keyboard stick from held direction indices (16 right, 17 left, 18 down, 19 up).
 * Diagonals stay on the unit circle; walking (Shift) is a half tilt. */
export const WALK_TILT = 0.5
export function keyboardStick(held, walking = false) {
  const [x, y] = normalizeStick(Number(held.has(16)) - Number(held.has(17)), Number(held.has(18)) - Number(held.has(19)), 0)
  const scale = walking ? WALK_TILT : 1
  // Round half away from zero so left/up and right/down tilt by the same amount.
  const round = value => Math.sign(value) * Math.round(Math.abs(value) * scale * 1000) / 1000 || 0
  return [round(x), round(y)]
}

/** Releases always win, including after focus or modifier changes. */
export function keyboardControl(event, keys, allowed, held) {
  if (event.type === 'keyup') return held.delete(event.code)
  const index = keys[event.code]
  // Auto-repeat changes nothing; swallow it so the page doesn't scroll.
  if (event.repeat && held.get(event.code) === index) { event.preventDefault(); return false }
  if (index === undefined || !allowed.has(index) || event.ctrlKey || event.metaKey || event.altKey || event.isComposing
    || event.target?.closest?.('input, textarea, select, [contenteditable]')
    || (event.code === 'Enter' && event.target?.closest?.('button'))) return false
  held.set(event.code, index)
  event.preventDefault()
  return true
}

/** Keep quick taps visible for several emulation frames; cancellation is immediate. */
export function buttonHolds(changed, { now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout, minimum = 80 } = {}) {
  const held = new Map()
  const remove = token => {
    const press = held.get(token)
    if (!press) return
    if (press.timer !== null) clearTimer(press.timer)
    held.delete(token); changed()
  }
  return {
    values: () => [...held.values()].map(press => press.index),
    press(token, index) {
      const previous = held.get(token)
      if (previous?.timer !== null && previous?.timer !== undefined) clearTimer(previous.timer)
      held.set(token, { index, started: now(), timer: null }); changed()
    },
    release(token) {
      const press = held.get(token)
      if (!press || press.timer !== null) return
      const remaining = minimum - (now() - press.started)
      if (remaining > 0) press.timer = setTimer(() => remove(token), remaining)
      else remove(token)
    },
    cancel: remove,
    lostCapture(token) {
      // Normal pointerup schedules the remaining pulse, then loses capture.
      // Unexpected capture loss without pointerup cancels the held input.
      if (held.get(token)?.timer === null) remove(token)
    },
    clear() {
      for (const press of held.values()) if (press.timer !== null) clearTimer(press.timer)
      held.clear(); changed()
    },
  }
}
export function roomSummary(room) {
  const reserved = room.players.filter(player => !player.connected).length
  const open = room.maxPlayers - room.players.length
  return `${room.players.length}/${room.maxPlayers} seats filled · ${open ? `${open} open` : 'Full'}${reserved ? ` · ${reserved} reserved for reconnect` : ''}${room.locked ? ' · Locked' : ''}`
}
export function roster(list, room, kick, connections) {
  const focusedId = list.contains(document.activeElement) ? document.activeElement.dataset.playerId : null
  list.replaceChildren()
  for (let slot = 0; slot < room.maxPlayers; slot++) {
    const player = room.players.find(player => player.slot === slot)
    const li = document.createElement('li')
    li.dataset.slot = slot
    const text = document.createElement('span')
    const state = !player ? (room.locked ? 'Empty · room locked' : 'Open seat')
      : !player.connected ? 'Reserved · reconnecting…'
      : slot === 0 ? 'Host'
      : connections ? connections.get(player.socketId) || 'Connecting to game…' : 'Joined room'
    text.textContent = `Player ${slot + 1}${player ? ` · ${player.nickname}` : ''} · ${state}`
    li.append(text)
    if (kick && player?.slot > 0) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.playerId = player.id
      button.textContent = 'Remove'
      button.setAttribute('aria-label', `Remove Player ${slot + 1} · ${player.nickname}`)
      button.onclick = () => kick(player.id)
      li.append(button)
    }
    list.append(li)
  }
  if (focusedId) {
    const replacement = [...list.querySelectorAll('button')].find(button => button.dataset.playerId === focusedId)
    if (replacement) replacement.focus({ preventScroll: true })
    else { list.tabIndex = -1; list.focus({ preventScroll: true }) }
  }
}

/** Host binds the socket's assigned slot; packets can never choose a player. */
export function inputReceiver(apply, now = () => performance.now(), core = 'snes') {
  const profile = ROOM_PROFILES[core]
  if (!profile) throw new Error('Unsupported input profile')
  let sequence = -1
  let held = new Map()
  let lastPacket = now()
  const release = () => { for (const index of held.keys()) apply(index, 0); held.clear() }
  const receive = (raw, enabled = true) => {
    if (typeof raw !== 'string' || raw.length > 1024) return false
    let packet
    try { packet = JSON.parse(raw) } catch { return false }
    if (!packet || typeof packet !== 'object' || packet.type !== 'controls' || !Number.isSafeInteger(packet.seq) || packet.seq <= sequence || packet.seq < 0
      || (packet.v !== undefined && packet.v !== LAN_PROTOCOL)
      || (profile.analog && packet.v !== LAN_PROTOCOL)
      || !Array.isArray(packet.buttons) || packet.buttons.length > profile.buttons.length
      || packet.buttons.some(index => !Number.isInteger(index) || !profile.buttons.includes(index))
      || (profile.analog && (!Array.isArray(packet.stick) || packet.stick.length !== 2 || packet.stick.some(value => !Number.isFinite(value) || Math.abs(value) > 1)))
      || (!profile.analog && packet.stick !== undefined)) return false
    sequence = packet.seq
    lastPacket = now()
    if (!enabled) { release(); return true }
    const next = new Map(packet.buttons.map(index => [index, profile.analog && index >= 20 ? 0x7fff : 1]))
    if (profile.analog) {
      const [x, y] = normalizeStick(...packet.stick, 0)
      for (const [index, value] of [[16, Math.max(0, x)], [17, Math.max(0, -x)], [18, Math.max(0, y)], [19, Math.max(0, -y)]]) {
        if (value) next.set(index, Math.round(value * 0x7fff))
      }
    }
    for (const index of held.keys()) if (!next.has(index)) apply(index, 0)
    for (const [index, value] of next) if (held.get(index) !== value) apply(index, value)
    held = next
    return true
  }
  return { receive, release, check: () => { if (now() - lastPacket > 1200) release() } }
}

/** Game streams are 60 Hz; prefer smooth motion and low latency over sharpness. */
export const STREAM_FPS = 60
const MAX_STREAM_LINES = 720
export async function tuneVideoSender(sender, sourceHeight = 0, fps = STREAM_FPS) {
  if (sender?.track?.kind !== 'video' || typeof sender.getParameters !== 'function') return
  try { sender.track.contentHint = 'motion' } catch { /* optional hint */ }
  try {
    const params = sender.getParameters()
    if (!params.encodings?.length) params.encodings = [{}]
    const encoding = params.encodings[0]
    encoding.maxFramerate = fps
    encoding.maxBitrate = 8000000 // Same-LAN budget; WebRTC still adapts downward.
    // Big host canvases (fullscreen) are scaled to 720 lines: N64 renders at 240–480.
    encoding.scaleResolutionDownBy = Math.max(1, sourceHeight / MAX_STREAM_LINES)
    // Under encoder or network load, drop resolution before frame rate.
    params.degradationPreference = 'maintain-framerate'
    await sender.setParameters(params)
  } catch { /* Browsers without these fields keep their defaults. */ }
}

/** Ask the guest's browser to keep as little video buffered as it can. */
export function lowLatencyReceiver(receiver) {
  try {
    if (!receiver) return
    if ('jitterBufferTarget' in receiver) receiver.jitterBufferTarget = 0
    else receiver.playoutDelayHint = 0
  } catch { /* unsupported */ }
}

/** Round-trip time and received video frame rate, for the quality readouts. */
export async function connectionQuality(pc) {
  const quality = { rttMs: null, fps: null, dropped: 0, cpuLimited: false }
  if (typeof pc?.getStats !== 'function') return quality
  try {
    (await pc.getStats()).forEach(report => {
      if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded' && Number.isFinite(report.currentRoundTripTime)) quality.rttMs = Math.round(report.currentRoundTripTime * 1000)
      if (report.type === 'outbound-rtp' && report.kind === 'video' && report.qualityLimitationReason === 'cpu') quality.cpuLimited = true
      if (report.type === 'inbound-rtp' && report.kind === 'video') { quality.fps = Number.isFinite(report.framesPerSecond) ? Math.round(report.framesPerSecond) : null; quality.dropped = report.framesDropped ?? 0 }
    })
  } catch { /* closed connection */ }
  return quality
}

/**
 * Host stream rate. Several 60 fps encoders can starve the emulator on a slow
 * computer, so sustained CPU limits drop every guest stream to 30 fps; a long
 * healthy spell restores 60. One sample per poll (every 2 s).
 */
export const STRAIN_SAMPLES = 3
export const RECOVERY_SAMPLES = 15
export const MAX_RECOVERY_SAMPLES = RECOVERY_SAMPLES * 8
/** Falling back soon after a recovery means 60 fps doesn't hold on this computer, so each
 * such fallback doubles the next wait (up to 4 minutes); a long steady spell resets it. */
export function nextStreamRate(state, cpuLimited) {
  const wait = state.wait ?? RECOVERY_SAMPLES
  const steady = state.fps === STREAM_FPS ? (state.steady ?? 0) + 1 : 0
  const next = { ...state, wait, steady, strained: cpuLimited ? state.strained + 1 : 0, healthy: cpuLimited ? 0 : state.healthy + 1 }
  if (next.fps === STREAM_FPS && next.strained >= STRAIN_SAMPLES) {
    const backoff = state.recovered === true && steady < MAX_RECOVERY_SAMPLES
    return { fps: 30, strained: 0, healthy: 0, steady: 0, recovered: false, wait: backoff ? Math.min(wait * 2, MAX_RECOVERY_SAMPLES) : RECOVERY_SAMPLES }
  }
  if (next.fps !== STREAM_FPS && next.healthy >= wait) return { fps: STREAM_FPS, strained: 0, healthy: 0, steady: 0, recovered: true, wait }
  return next
}

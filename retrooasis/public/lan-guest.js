import { connectSocket, createPeer, lanInfo, request, roster, roomSummary, status, CORE_LABELS, keyboardControl, buttonHolds, savedNickname, saveNickname, roomCodeFrom } from './lan-shared.js'
import { LAN_CAPABILITIES, LAN_PROTOCOL, normalizeStick, inputIndices, gamepadControls } from './lan-capabilities.js'
import { readControllers, ControllerSelector, ControllerGate } from './controller-input.js'

const joinForm = document.querySelector('#join-form')
const joinView = document.querySelector('[data-lan-join]')
const playView = document.querySelector('[data-lan-play]')
const video = document.querySelector('#lan-video')
const overlay = document.querySelector('[data-lan-overlay]')
const sound = document.querySelector('#sound')
const retryService = document.querySelector('#retry-service')
let socket, room, peer, channel, resumeToken, playerId
let joining = false
let ended = false
let guestInput
let timeout
let previousHost
let generation = 0
let controlSequence = 0
const { code: codeInput, nickname: nicknameInput } = joinForm.elements
nicknameInput.value = savedNickname()
const inviteCode = () => roomCodeFrom(location.hash)
function prefillFromInvite() {
  if (room || !/^[A-F0-9]{10}$/.test(inviteCode())) return
  codeInput.value = inviteCode()
  // An invite only needs a name; Enter joins when one is remembered.
  nicknameInput.focus({ preventScroll: true })
}
prefillFromInvite()
window.addEventListener('hashchange', prefillFromInvite)
// Pasting a whole invite link into the code field keeps just the code.
codeInput.addEventListener('input', () => { const next = roomCodeFrom(codeInput.value); if (next !== codeInput.value && /^[A-F0-9]{10}$/.test(next)) codeInput.value = next })

function closePeer() {
  clearTimeout(timeout)
  guestInput?.dispose(); guestInput = null
  channel = null
  peer?.close(); peer = null
  video.srcObject = null
  video.load()
  overlay.textContent = 'Waiting for the host’s game…'
  overlay.hidden = false
  previousHost = null
  controlSequence = 0
}
function end(message) {
  generation++
  joining = false
  joinForm.querySelector('button').disabled = false
  ended = true
  closePeer()
  room = null; resumeToken = null; playerId = null
  playView.hidden = true; joinView.hidden = false
  if (document.fullscreenElement === playView) void document.exitFullscreen().catch(() => {})
  codeInput.focus({ preventScroll: true })
  status(message)
}
function bindInput(core, send) {
  const keyboard = new Map()
  const pointers = buttonHolds(() => transmit(true))
  let gamepad = new Set()
  const padSelector = new ControllerSelector()
  const padGate = new ControllerGate()
  let last = ''
  let lastSent = 0
  let active = true
  const profile = LAN_CAPABILITIES[core]
  const n64 = !!profile.analog
  const allowed = new Set(inputIndices(core))
  const keys = n64
    ? { ArrowUp: 19, ArrowDown: 18, ArrowLeft: 17, ArrowRight: 16, KeyZ: 0, KeyX: 1, KeyQ: 12, KeyE: 10, KeyR: 11, KeyI: 23, KeyK: 22, KeyJ: 21, KeyL: 20, KeyW: 4, KeyS: 5, KeyA: 6, KeyD: 7, Enter: 3 }
    : { ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, KeyZ: 0, KeyX: 8, KeyA: 1, KeyS: 9, KeyQ: 10, KeyW: 11, Enter: 3, ShiftLeft: 2, ShiftRight: 2 }
  let padStick = [0, 0], touchStick = [0, 0], stickPointer = null
  const controls = document.querySelector('.ro-lan-controls')
  const labels = n64 ? { 0: 'A', 1: 'B', 10: 'L', 11: 'R', 12: 'Z', 23: 'C ↑', 21: 'C ←', 22: 'C ↓', 20: 'C →' }
    : core === 'segaMD' ? { 1: 'A', 0: 'B', 8: 'C', 10: 'X', 9: 'Y', 11: 'Z' } : { 0: 'B', 8: 'A', 1: 'Y', 9: 'X', 10: 'L', 11: 'R' }
  if (core === 'segaMD') { keys.KeyS = 10; keys.KeyQ = 9 }
  controls.replaceChildren()
  if (n64) {
    const stick = document.createElement('div')
    stick.className = 'ro-lan-stick'; stick.setAttribute('role', 'group'); stick.setAttribute('aria-label', 'Analog stick. Drag to move or use keyboard arrows.'); stick.tabIndex = 0
    stick.innerHTML = '<span>Stick</span><i aria-hidden="true"></i>'
    const move = event => {
      if (!active || event.pointerId !== stickPointer) return
      const rect = stick.getBoundingClientRect()
      touchStick = normalizeStick((event.clientX - rect.left - rect.width / 2) / (rect.width / 2), (event.clientY - rect.top - rect.height / 2) / (rect.height / 2))
      stick.querySelector('i').style.transform = `translate(${touchStick[0] * 35}px, ${touchStick[1] * 35}px)`
      transmit(true)
    }
    stick.onpointerdown = event => { if (event.button !== 0 || stickPointer !== null) return; event.preventDefault(); stickPointer = event.pointerId; stick.setPointerCapture(event.pointerId); move(event) }
    stick.onpointermove = move
    const neutral = event => { if (event.pointerId !== stickPointer) return; stickPointer = null; touchStick = [0, 0]; stick.querySelector('i').style.transform = ''; transmit(true) }
    stick.onpointerup = neutral; stick.onpointercancel = neutral; stick.onlostpointercapture = neutral
    controls.append(stick)
  }
  const group = (label, buttons, className) => {
    const container = document.createElement('div')
    container.className = className
    container.setAttribute('role', 'group'); container.setAttribute('aria-label', label)
    for (const [index, name] of buttons) {
      const button = document.createElement('button')
      button.type = 'button'; button.textContent = name; button.dataset.control = index; button.setAttribute('aria-label', `Game ${name}`)
      button.onpointerdown = event => { if (!active || event.button !== 0) return; event.preventDefault(); button.setPointerCapture(event.pointerId); pointers.press(event.pointerId, index) }
      button.onclick = event => {
        if (!active || event.detail !== 0) return // Keyboard / assistive-technology activation.
        const tap = Symbol('tap')
        pointers.press(tap, index); pointers.release(tap)
      }
      button.onpointerup = event => pointers.release(event.pointerId)
      button.onpointercancel = event => pointers.cancel(event.pointerId)
      button.onlostpointercapture = event => pointers.lostCapture(event.pointerId)
      container.append(button)
    }
    controls.append(container)
  }
  group('Directional controls', [[4, '↑'], [6, '←'], [5, '↓'], [7, '→']], 'ro-lan-dpad')
  group('Game buttons', Object.entries(labels).filter(([index]) => allowed.has(Number(index))).map(([index, label]) => [Number(index), label]), 'ro-lan-buttons')
  group('Start and select', [[3, 'Start'], ...(core === 'segaMD' || n64 ? [] : [[2, 'Select']])], 'ro-lan-system')
  function transmit(force = false) {
    if (!active) return
    const held = new Set([...keyboard.values(), ...pointers.values(), ...gamepad])
    const buttons = [...held].filter(index => profile.buttons.includes(index)).sort((a, b) => a - b)
    const keyStick = normalizeStick(Number(held.has(16)) - Number(held.has(17)), Number(held.has(18)) - Number(held.has(19)), 0)
    const stick = touchStick.some(Boolean) ? touchStick : keyStick.some(Boolean) ? keyStick : padStick
    const key = `${buttons.join(',')}/${stick.join(',')}`
    if (!force && key === last && performance.now() - lastSent < 250) return
    last = key; lastSent = performance.now()
    send(JSON.stringify({ type: 'controls', v: LAN_PROTOCOL, seq: controlSequence++, buttons, ...(n64 ? { stick } : {}) }))
    for (const button of controls.querySelectorAll('button')) button.setAttribute('aria-pressed', String(buttons.includes(Number(button.dataset.control))))
  }
  const onKey = event => {
    if (keyboardControl(event, keys, allowed, keyboard)) transmit(true)
  }
  const release = () => { padGate.reset(); keyboard.clear(); gamepad.clear(); touchStick = [0, 0]; padStick = [0, 0]; stickPointer = null; const thumb = controls.querySelector('.ro-lan-stick i'); if (thumb) thumb.style.transform = ''; pointers.clear() }
  const visibility = () => { if (document.hidden) release() }
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey)
  window.addEventListener('blur', release); document.addEventListener('visibilitychange', visibility)
  const poll = () => {
    if (!active) return
    gamepad = new Set()
    padStick = [0, 0]
    if (document.hasFocus() && !document.hidden) {
      try {
        const pad = padGate.read(padSelector.read(readControllers().pads))
        if (pad) {
          const input = gamepadControls(pad, core)
          gamepad = new Set(input.buttons)
          padStick = input.stick
        }
      } catch { /* HTTP origins can deny gamepad access; keyboard and touch still work. */ }
    }
    else padGate.reset()
    transmit()
    frame = requestAnimationFrame(poll)
  }
  let frame = requestAnimationFrame(poll)
  // Heartbeats continue when animation frames are throttled; only neutral state is sent when hidden.
  const heartbeat = setInterval(() => { if (document.hidden) release(); else transmit() }, 250)
  return { release, dispose: () => {
    release(); active = false; cancelAnimationFrame(frame); clearInterval(heartbeat)
    window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey)
    window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', visibility)
    controls.replaceChildren()
  } }
}
function enableInput() {
  if (!room || channel?.readyState !== 'open' || guestInput) return
  const incoming = channel
  guestInput = bindInput(room.core, message => { if (channel === incoming && incoming.readyState === 'open' && incoming.bufferedAmount < 4096) incoming.send(message) })
}
function update(next) {
  if (!room || room.code !== next.code) return
  room = next
  const me = room.players.find(player => player.id === playerId)
  const host = room.players.find(player => player.slot === 0)
  if (!me || !host) { end('This room is no longer available.'); return }
  roster(document.querySelector('[data-lan-players]'), room)
  const capacity = document.querySelector('[data-lan-capacity]')
  const summary = roomSummary(room)
  if (capacity.textContent !== summary) capacity.textContent = summary
  document.querySelector('[data-lan-title]').textContent = `${room.title} · ${CORE_LABELS[room.core] || room.core}`
  document.querySelector('[data-lan-slot]').textContent = `You are Player ${me.slot + 1} · ${me.nickname}`
  if (previousHost === host.socketId && peer) return
  closePeer()
  previousHost = host.socketId
  const stream = new MediaStream()
  overlay.hidden = false
  const currentPeer = createPeer(socket, host.socketId, event => {
    if (peer !== currentPeer) return
    stream.addTrack(event.track)
    video.srcObject = stream
    void video.play().catch(() => status('Tap Enable sound to start the game stream.'))
  }, state => {
    if (peer !== currentPeer) return
    if (state === 'connected') { clearTimeout(timeout); enableInput(); overlay.hidden = video.readyState >= 2; status('Connected. Use your controls to play; Enable sound turns on game audio.') }
    if (['failed', 'disconnected'].includes(state)) {
      guestInput?.dispose(); guestInput = null
      overlay.textContent = 'Game connection lost. Choose Reconnect to try again.'
      overlay.hidden = false
      status('Game connection lost. Tap Reconnect to retry on the same LAN.')
    }
  })
  peer = currentPeer
  peer.pc.ondatachannel = event => {
    if (peer !== currentPeer) return
    if (event.channel.label !== 'controls') return
    channel = event.channel
    const incoming = channel
    channel.onopen = () => {
      if (channel !== incoming) return
      enableInput()
    }
    channel.onclose = () => { if (channel !== incoming) return; guestInput?.dispose(); guestInput = null; status('Controls disconnected. Tap Reconnect to retry.') }
  }
  timeout = setTimeout(() => status('Connection timed out. Both devices must use the same LAN; guest Wi-Fi/client isolation can prevent joining.'), 15000)
}
async function join(reconnecting = false) {
  if (joining || !socket?.connected) return
  joining = true
  const attempt = ++generation
  joinForm.querySelector('button').disabled = true
  status(reconnecting ? 'Rejoining your room…' : 'Joining the room…')
  const data = new FormData(joinForm)
  const nickname = String(data.get('nickname'))
  try {
    const reply = await request(socket, 'room:join', { code: roomCodeFrom(data.get('code')), nickname, ...(reconnecting && resumeToken ? { resumeToken } : {}) })
    if (attempt !== generation || !socket.connected) return
    if (reply.room.protocol !== LAN_PROTOCOL || reply.room.profile !== reply.room.core || !LAN_CAPABILITIES[reply.room.core]) {
      // The server already seated us; free the seat instead of reserving it.
      socket.emit('room:leave', {})
      throw new Error('Update the app to join this room’s input profile.')
    }
    ended = false
    room = reply.room; playerId = reply.playerId; resumeToken = reply.resumeToken
    if (!reconnecting) saveNickname(nickname)
    codeInput.value = room.code
    location.hash = room.code
    joinView.hidden = true; playView.hidden = false
    playView.focus({ preventScroll: true })
    document.querySelector('[data-lan-input-hint]').textContent = room.core === 'n64'
      ? 'Keyboard: arrows = stick · WASD = D-pad · Z/X = A/B · Q = Z · E/R = L/R · IJKL = C-buttons · Enter starts. Gamepad: left stick moves, right stick uses C-buttons, triggers use Z.'
      : room.core === 'segaMD'
      ? 'Keyboard: arrows move · A/Z/X = A/B/C · S/Q/W = X/Y/Z · Enter starts.'
      : room.core === 'nes'
        ? 'Keyboard: arrows move · Z = B · X = A · Enter starts · Shift selects.'
        : 'Keyboard: arrows move · Z = B · X = A · A = Y · S = X · Q/W = L/R · Enter starts · Shift selects.'
    document.querySelector('[data-lan-input-hint]').textContent += ' After connecting or returning to this tab, release gamepad buttons and center both sticks before playing.'
    update(room)
    status('Joined. Connecting to the host’s game…')
  } catch (error) { if (attempt === generation) end(error.message) }
  finally { if (attempt === generation) { joining = false; joinForm.querySelector('button').disabled = false } }
}
video.onplaying = () => { if (peer?.pc.connectionState === 'connected') overlay.hidden = true }
sound.onclick = async () => {
  video.muted = !video.muted
  try { await video.play(); sound.textContent = video.muted ? 'Enable sound' : 'Mute sound' }
  catch { video.muted = true; sound.textContent = 'Enable sound'; status('Audio is not ready. Try Enable sound after the stream connects.') }
}
document.querySelector('#fullscreen').onclick = () => { void playView.requestFullscreen?.().catch(() => status('Fullscreen is unavailable in this browser.')) }
document.querySelector('#leave').onclick = () => {
  if (joining) return
  end('You left the room.')
  joining = true
  joinForm.querySelector('button').disabled = true
  void request(socket, 'room:leave').catch(() => {}).finally(() => { joining = false; joinForm.querySelector('button').disabled = false })
}
document.querySelector('#reconnect').onclick = () => {
  guestInput?.release(); closePeer()
  if (socket) { socket.disconnect(); socket.connect() }
}
retryService.onclick = () => {
  retryService.hidden = true
  status('Reconnecting to the LAN room service…')
  if (socket) { socket.disconnect(); socket.connect() }
  else void initialize()
}
joinForm.onsubmit = event => { event.preventDefault(); void join() }
window.addEventListener('pagehide', () => { guestInput?.release(); socket?.emit('room:leave', {}); socket?.disconnect(); closePeer() }, { once: true })
async function initialize() {
try {
  await lanInfo()
  if (!window.RTCPeerConnection) throw new Error('This browser does not support WebRTC. Use a current browser with a trusted HTTPS LAN address.')
  socket = await connectSocket()
  socket.on('room:update', update)
  socket.on('room:signal', ({ sender, signal }) => { if (room?.players.find(player => player.slot === 0)?.socketId === sender) void peer?.accept(signal) })
  socket.on('room:ended', ({ reason }) => end(reason))
  socket.on('disconnect', () => { generation++; joining = false; joinForm.querySelector('button').disabled = true; retryService.hidden = false; guestInput?.release(); closePeer(); status(!ended && room ? 'Room service disconnected. Trying to reconnect…' : 'Room service disconnected. Retry when the host server is back.') })
  socket.on('connect', () => { retryService.hidden = true; if (!ended && resumeToken) void join(true); else { joinForm.querySelector('button').disabled = false; status('LAN room service ready. Enter the invite code and your name.') } })
  socket.on('connect_error', () => { retryService.hidden = false; status('Cannot reach the LAN room service. Retry when the host server is back.') })
  socket.io.on('reconnect_failed', () => { if (!ended && room) status('Room service is still unavailable. Tap Reconnect when the host server is back.') })
  joinForm.querySelector('button').disabled = false
  retryService.hidden = true
  status('LAN room service ready. Enter the invite code and your name.')
} catch (error) { joinForm.querySelector('button').disabled = true; retryService.hidden = false; status(error.message) }
}
void initialize()

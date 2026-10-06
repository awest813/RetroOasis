import { connectSocket, createPeer, lanInfo, request, roster, roomSummary, status, CORE_LABELS, keyboardControl, buttonHolds, savedNickname, saveNickname, roomCodeFrom, lowLatencyReceiver, connectionQuality, keyboardStick } from './lan-shared.js'
import { ROOM_PROFILES, LAN_PROTOCOL, normalizeStick, inputIndices, gamepadControls } from './lan-capabilities.js'
import { readControllers, ControllerSelector, ControllerGate } from './controller-input.js'
import { cartridgeInfo, validSaveSize } from './link-session.js'
import { unwrapRom } from './rom-source.js'
import { fileReceiver, sendFile, downloadBytes, SAVE_LIMIT } from './link-transfer.js'

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
// Link rooms: the guest's cartridge runs as Console 2 on the host.
const cartView = document.querySelector('[data-link-cart]')
const cartForm = document.querySelector('#cart-form')
const cartStatus = document.querySelector('[data-link-cart-status]')
const requestSave = document.querySelector('#request-save')
let cartChannel = null
let cartInserted = false
let linkRunning = false
function refreshCart() {
  const linked = room?.mode === 'linked-consoles'
  cartView.hidden = !linked
  const open = cartChannel?.readyState === 'open'
  cartForm.hidden = linkRunning || cartInserted
  cartForm.querySelector('button').disabled = !open
  requestSave.hidden = !linkRunning || !open
}
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

// Stream frame rate and latency, so players can tell a weak Wi-Fi link from a slow game.
const qualityLine = document.querySelector('[data-lan-quality]')
setInterval(async () => {
  if (!peer || peer.pc.connectionState !== 'connected') { qualityLine.textContent = ''; return }
  const { rttMs, fps, dropped } = await connectionQuality(peer.pc)
  qualityLine.textContent = [fps !== null && `${fps} fps`, rttMs !== null && `${rttMs} ms`, dropped && `${dropped} dropped frames`].filter(Boolean).join(' · ')
}, 2000)

function closePeer() {
  clearTimeout(timeout)
  cartChannel = null
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
  cartInserted = false; linkRunning = false; refreshCart(); cartStatus.textContent = ''
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
  const profile = ROOM_PROFILES[core]
  const n64 = !!profile.analog
  const allowed = new Set(inputIndices(core))
  const keys = n64
    ? { ArrowUp: 19, ArrowDown: 18, ArrowLeft: 17, ArrowRight: 16, KeyZ: 0, KeyX: 1, KeyQ: 12, KeyE: 10, KeyR: 11, KeyI: 23, KeyK: 22, KeyJ: 21, KeyL: 20, KeyW: 4, KeyS: 5, KeyA: 6, KeyD: 7, Enter: 3 }
    : { ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, KeyZ: 0, KeyX: 8, KeyA: 1, KeyS: 9, KeyQ: 10, KeyW: 11, Enter: 3, ShiftLeft: 2, ShiftRight: 2 }
  let padStick = [0, 0], touchStick = [0, 0], stickPointer = null
  // N64: hold Shift for a half tilt, so keyboard players can walk as well as run.
  let walking = false
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
  if (n64) {
    // Laid out like the controller: shoulders, B/A, and the C-buttons as a diamond.
    group('Shoulder buttons', [[10, 'L'], [12, 'Z'], [11, 'R']], 'ro-lan-buttons ro-lan-shoulders')
    group('Game buttons', [[1, 'B'], [0, 'A']], 'ro-lan-buttons ro-lan-face')
    group('C buttons', [[23, 'C ↑'], [21, 'C ←'], [22, 'C ↓'], [20, 'C →']], 'ro-lan-dpad ro-lan-cpad')
  } else group('Game buttons', Object.entries(labels).filter(([index]) => allowed.has(Number(index))).map(([index, label]) => [Number(index), label]), 'ro-lan-buttons')
  group('Start and select', [[3, 'Start'], ...(core === 'segaMD' || n64 ? [] : [[2, 'Select']])], 'ro-lan-system')
  function transmit(force = false) {
    if (!active) return
    const held = new Set([...keyboard.values(), ...pointers.values(), ...gamepad])
    const buttons = [...held].filter(index => profile.buttons.includes(index)).sort((a, b) => a - b)
    const keyStick = keyboardStick(held, walking)
    const stick = touchStick.some(Boolean) ? touchStick : keyStick.some(Boolean) ? keyStick : padStick
    const key = `${buttons.join(',')}/${stick.join(',')}`
    if (!force && key === last && performance.now() - lastSent < 250) return
    last = key; lastSent = performance.now()
    send(JSON.stringify({ type: 'controls', v: LAN_PROTOCOL, seq: controlSequence++, buttons, ...(n64 ? { stick } : {}) }))
    for (const button of controls.querySelectorAll('button')) button.setAttribute('aria-pressed', String(buttons.includes(Number(button.dataset.control))))
  }
  const onKey = event => {
    if (n64 && (event.code === 'ShiftLeft' || event.code === 'ShiftRight') && !event.target?.closest?.('input, textarea, select, [contenteditable]')) {
      const next = event.type === 'keydown'
      if (next !== walking) { walking = next; transmit(true) }
      return
    }
    if (keyboardControl(event, keys, allowed, keyboard)) transmit(true)
  }
  const release = () => { walking = false; padGate.reset(); keyboard.clear(); gamepad.clear(); touchStick = [0, 0]; padStick = [0, 0]; stickPointer = null; const thumb = controls.querySelector('.ro-lan-stick i'); if (thumb) thumb.style.transform = ''; pointers.clear() }
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
    lowLatencyReceiver(event.receiver)
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
    if (event.channel.label === 'cart' && room.mode === 'linked-consoles') { attachCart(event.channel); return }
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
function attachCart(channel) {
  cartChannel = channel
  channel.binaryType = 'arraybuffer'
  const receive = fileReceiver({
    limits: { save: SAVE_LIMIT },
    onFile: file => {
      downloadBytes(file.bytes, file.name)
      cartStatus.textContent = `Downloaded ${file.name}. Load it in your emulator or RetroOasis Saves to keep your trade.`
    },
    onError: error => { cartStatus.textContent = error.message },
    onMessage: data => {
      if (data.type === 'hello') {
        linkRunning = data.running === true
        // A new game connection before the link starts means the host needs the cartridge again.
        if (!linkRunning) cartInserted = false
        if (typeof data.accept === 'string') cartForm.elements.rom.accept = data.accept
        if (!linkRunning && !cartInserted) cartStatus.textContent = `Insert your ${room.core === 'gba' ? 'Game Boy Advance' : 'Game Boy / Game Boy Color'} game to link with ${data.title || 'the host'}.`
        if (linkRunning) cartStatus.textContent = 'The link is running. Play on Console 2.'
      } else if (data.type === 'session') {
        linkRunning = data.running === true
        cartStatus.textContent = linkRunning ? 'Linked! Use the game’s trade or link menu. Save in-game, then choose Save to this device.' : 'The host ended the link session. Keep your downloaded save file.'
      } else if ((data.type === 'status' || data.type === 'error') && typeof data.text === 'string') {
        if (data.type === 'error' && !linkRunning) cartInserted = false
        cartStatus.textContent = data.text.slice(0, 300)
      }
      refreshCart()
    },
  })
  channel.onmessage = event => { if (cartChannel === channel) receive(event.data) }
  channel.onopen = refreshCart
  channel.onclose = refreshCart
  refreshCart()
}
cartForm.onsubmit = async event => {
  event.preventDefault()
  const channel = cartChannel
  if (channel?.readyState !== 'open' || !room) return
  const button = cartForm.querySelector('button')
  button.disabled = true
  try {
    const rom = await unwrapRom({ name: cartForm.elements.rom.files[0].name, bytes: new Uint8Array(await cartForm.elements.rom.files[0].arrayBuffer()) })
    const info = cartridgeInfo(room.core, rom.bytes)
    const saveFile = cartForm.elements.save.files?.[0]
    if (saveFile && (saveFile.size > SAVE_LIMIT || !validSaveSize(room.core, saveFile.size))) throw new Error('That save file does not match this system.')
    cartStatus.textContent = `Sending ${info.title} to the host…`
    await sendFile(channel, 'rom', rom.name, rom.bytes)
    if (saveFile) await sendFile(channel, 'save', saveFile.name, new Uint8Array(await saveFile.arrayBuffer()))
    cartInserted = true
  } catch (error) { cartStatus.textContent = error.message }
  finally { button.disabled = false; refreshCart() }
}
requestSave.onclick = () => {
  if (cartChannel?.readyState !== 'open') return
  cartChannel.send(JSON.stringify({ type: 'request-save' }))
  cartStatus.textContent = 'Requesting your save…'
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
    if (reply.room.protocol !== LAN_PROTOCOL || reply.room.profile !== reply.room.core || !ROOM_PROFILES[reply.room.core]) {
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
    // Start at the game: the join form may have left the page scrolled down.
    playView.scrollIntoView({ block: 'start' })
    refreshCart()
    document.querySelector('[data-lan-input-hint]').textContent = room.core === 'gb' || room.core === 'gba'
      ? `Keyboard: arrows move · Z = B · X = A · Enter = Start · Shift = Select${room.core === 'gba' ? ' · Q/W = L/R' : ''}.`
      : room.core === 'n64'
      ? 'Keyboard: arrows = stick (hold Shift to walk) · WASD = D-pad · Z/X = A/B · Q = Z · E/R = L/R · IJKL = C-buttons · Enter starts. Gamepad: left stick moves, right stick uses C-buttons, triggers use Z.'
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

import { connectSocket, createPeer, lanInfo, request, roster, roomSummary, status as pageStatus, CORE_LABELS, keyboardControl, buttonHolds, savedNickname, saveNickname, roomCodeFrom, lowLatencyReceiver, connectionQuality, keyboardStick } from './lan-shared.js'
import { ROOM_PROFILES, LAN_PROTOCOL, normalizeStick, inputIndices, gamepadControls, keyboardLayout, BUTTON_LABELS } from './lan-capabilities.js'
import { readControllers, ControllerSelector, ControllerGate } from './controller-input.js'
import { cartridgeInfo, cartTitle, validSaveSize } from './link-session.js'
import { unwrapRom } from './rom-source.js'
import { fileReceiver, sendFile, downloadBytes, SAVE_LIMIT } from './link-transfer.js'

const joinForm = document.querySelector('#join-form')
const joinView = document.querySelector('[data-lan-join]')
const playView = document.querySelector('[data-lan-play]')
const video = document.querySelector('#lan-video')
const sound = document.querySelector('#sound')
const retryService = document.querySelector('#retry-service')
const padChip = document.querySelector('[data-lan-pad]')
// While playing, messages show right under the game (the page-level line is hidden then,
// so screen readers hear each message once).
const liveLine = document.querySelector('[data-lan-live]')
function status(message) {
  pageStatus(message)
  if (liveLine) liveLine.textContent = message
}
// On-screen controls: on by default for touch screens, off for mouse and keyboard; the
// player's choice is remembered on this device.
const touchToggle = document.querySelector('[data-lan-touch-toggle]')
const coarsePointer = matchMedia('(pointer: coarse)')
const readPref = () => { try { return localStorage.getItem('retrooasis.lan.touch') } catch { return null } }
function applyTouchPref() {
  const pref = readPref()
  const show = pref === null ? coarsePointer.matches : pref === '1'
  document.body.classList.toggle('ro-lan-touch-on', show)
  if (touchToggle) touchToggle.checked = show
}
if (touchToggle) touchToggle.onchange = () => { try { localStorage.setItem('retrooasis.lan.touch', touchToggle.checked ? '1' : '0') } catch { /* private mode */ } applyTouchPref() }
coarsePointer.addEventListener?.('change', applyTouchPref)
applyTouchPref()
// Keyboard players see the key list at once; touch players open it if they want it.
const keysCard = document.querySelector('[data-lan-keys]')
if (keysCard) keysCard.open = !coarsePointer.matches
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
let linkEnded = false
// The host sends Console 2's save each time the game saves; it is kept here,
// ready to download, even if the host goes away.
let latestSave = null // { name, bytes, at, downloaded }
const syncLine = document.querySelector('[data-link-sync]')
function refreshCart() {
  const linked = room?.mode === 'linked-consoles'
  cartView.hidden = !linked
  // Before the link starts the cartridge box sits right under the screen, where the guest
  // needs it; while it runs, the touch controls take that place (on a phone the box pushed
  // them a screen away) and the box follows the toolbar. Moved only on a change, so a
  // focused button inside it keeps focus.
  const playing = linkRunning || linkEnded
  const anchor = playing ? document.querySelector('.ro-lan-toolbar') : document.querySelector('.ro-lan-controls')
  if (linked && anchor && (playing ? anchor.nextElementSibling !== cartView : anchor.previousElementSibling !== cartView)) {
    if (playing) anchor.after(cartView)
    else anchor.before(cartView)
  }
  const open = cartChannel?.readyState === 'open'
  cartForm.hidden = linkRunning || cartInserted || linkEnded
  cartForm.querySelector('button').disabled = !open
  requestSave.hidden = !(linkRunning && open) && !latestSave
  syncLine.textContent = latestSave ? `Latest save from your game: ${latestSave.at.toLocaleTimeString()}${latestSave.downloaded ? ' (downloaded)' : ''}.` : ''
  refreshLobby()
}
// The lobby covers the stage until the host's game is on screen: who is here, what is
// still happening (connecting, cartridge, start) and the controls. It comes back while the
// host pauses, while a dropped connection rejoins, and when it can't.
const lobby = document.querySelector('[data-lan-lobby]')
const stage = document.querySelector('.ro-lan-stage')
let trouble = null // null, 'reconnecting' or 'lost'
let slow = false
function lobbyStep(name, status, label) {
  const step = lobby.querySelector(`[data-step="${name}"]`)
  step.hidden = status === null
  if (status === null) return
  step.dataset.status = status
  step.querySelector('span').textContent = label
}
function refreshLobby() {
  if (!room) return
  const me = room.players.find(player => player.id === playerId)
  const hostName = room.players.find(player => player.slot === 0)?.nickname || 'the host'
  const linked = room.mode === 'linked-consoles'
  const connected = peer?.pc.connectionState === 'connected' && channel?.readyState === 'open'
  const live = connected && video.readyState >= 2
  const waitingLink = linked && !linkRunning && !linkEnded
  const needsCart = waitingLink && !cartInserted
  const mode = trouble ?? (hostPaused && connected ? 'paused' : !live || waitingLink ? 'lobby' : null)
  lobby.hidden = !mode
  // With no game picture behind it, the lobby takes the stage's place and its full height.
  if (mode && mode !== 'paused') stage.dataset.lobby = 'full'
  else delete stage.dataset.lobby
  if (!mode) return
  lobby.dataset.mode = mode
  const text = (selector, value) => { const node = lobby.querySelector(selector); if (node.textContent !== value) node.textContent = value }
  text('[data-lobby-eyebrow]', mode === 'paused' ? 'Paused' : mode === 'reconnecting' ? `Reconnecting · attempt ${Math.min(autoRetries + 1, AUTO_RETRIES)} of ${AUTO_RETRIES}` : mode === 'lost' ? 'Disconnected' : `Lobby · You’re Player ${(me?.slot ?? 0) + 1}`)
  text('[data-lobby-head]', mode === 'paused' ? 'The host paused the game'
    : mode === 'reconnecting' ? 'Connection interrupted'
      : mode === 'lost' ? 'Game connection lost'
        : !connected ? (slow ? `Still connecting to ${hostName}…` : `Connecting to ${hostName}’s game…`)
          : needsCart ? 'Insert your cartridge'
            : waitingLink ? `Waiting for ${hostName} to start the link`
              : 'Starting the game…')
  text('[data-lobby-game]', `${room.title} · ${CORE_LABELS[room.core] || room.core}`)
  text('[data-lobby-tip]', mode === 'paused' ? 'Your controls work again when they resume.'
    : mode === 'reconnecting' ? 'Your seat is held while this page rejoins.'
      : mode === 'lost' ? 'Check that both devices are still on the same Wi-Fi, then reconnect.'
        : slow && !connected ? 'Both devices must be on the same Wi-Fi or LAN. Guest networks with client isolation block the game connection.'
          : needsCart && connected ? 'Choose your game below, and your save file to trade from your own game.'
            : coarsePointer.matches ? 'On-screen controls appear under the game. Sound turns on with your first tap.'
              : keyboardLayout(room.core).hint)
  lobbyStep('joined', 'done', 'Joined the room')
  lobbyStep('connect', connected ? 'done' : 'current', connected ? `Connected to ${hostName}` : `Connecting to ${hostName}`)
  lobbyStep('cart', linked ? (cartInserted || linkRunning ? 'done' : connected ? 'current' : 'waiting') : null, cartInserted || linkRunning ? 'Cartridge inserted' : 'Insert your cartridge')
  lobbyStep('start', live && !waitingLink ? 'done' : connected && !needsCart ? 'current' : 'waiting', linked ? `${hostName} starts the link` : 'Game on screen')
  const steps = [...lobby.querySelectorAll('[data-step]')].filter(step => !step.hidden)
  steps.forEach((step, index) => { step.querySelector('b').textContent = index + 1 })
  lobby.querySelector('[data-lobby-steps]').style.setProperty('--steps', steps.length)
  lobby.querySelector('[data-lobby-action]').hidden = mode !== 'lost'
}
function keepSave(file, downloaded) {
  latestSave = { name: file.name, bytes: file.bytes, at: new Date(), downloaded }
  if (downloaded) downloadBytes(file.bytes, file.name)
}
// Leaving a room must not lose a save the guest hasn't downloaded yet.
function rescueSave() {
  if (!latestSave || latestSave.downloaded) return ''
  downloadBytes(latestSave.bytes, latestSave.name)
  return ` Your latest save (${latestSave.name}) was downloaded.`
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
  // A colour cue alongside the numbers: smooth, playable, or struggling.
  qualityLine.dataset.level = fps === null ? '' : fps >= 45 && (rttMs ?? 0) < 40 ? 'good' : fps >= 25 && (rttMs ?? 0) < 100 ? 'fair' : 'poor'
}, 2000)

// Each new track calls play() again, and a newer call aborts the older one: that's not an
// error. If the browser refuses to play with sound, play muted rather than show a frozen
// screen; the next tap or key press turns sound back on.
async function startVideo() {
  try { await video.play() }
  catch (error) {
    if (error?.name === 'AbortError') return
    if (!video.muted) {
      video.muted = true; soundChoice = false; sound.textContent = 'Enable sound'
      try { await video.play(); status('Playing muted. Press any key or tap the game to turn sound back on.'); return } catch { /* still blocked */ }
    }
    status('Tap the game to start the stream.')
  }
}
// The host announces pauses on the controls channel; the stream alone would just freeze.
let hostPaused = false
function showHostPause(paused) {
  if (paused === hostPaused) return
  hostPaused = paused
  status(paused ? 'The host paused the game. Your controls work again when they resume.' : 'The host resumed the game.')
  refreshLobby()
}
function closePeer() {
  clearTimeout(timeout)
  hostPaused = false
  cartChannel = null
  guestInput?.dispose(); guestInput = null
  channel = null
  peer?.close(); peer = null
  video.srcObject = null
  video.load()
  previousHost = null
  controlSequence = 0
  refreshLobby()
}
function end(message) {
  generation++
  clearTimeout(autoTimer); autoTimer = null; autoRetries = 0
  trouble = null; slow = false
  joining = false
  joinForm.querySelector('button').disabled = false
  ended = true
  closePeer()
  room = null; resumeToken = null; playerId = null
  const rescued = rescueSave()
  latestSave = null
  cartInserted = false; linkRunning = false; linkEnded = false; refreshCart(); cartStatus.textContent = ''
  playView.hidden = true; joinView.hidden = false
  if (document.fullscreenElement === playView) void document.exitFullscreen().catch(() => {})
  codeInput.focus({ preventScroll: true })
  status(message + rescued)
}
function bindInput(core, send) {
  const keyboard = new Map()
  const pointers = buttonHolds(() => transmit(true))
  let gamepad = new Set()
  const padSelector = new ControllerSelector()
  const padGate = new ControllerGate()
  let last = ''
  let lastSent = 0
  let changedAt = 0
  let active = true
  const profile = ROOM_PROFILES[core]
  const n64 = !!profile.analog
  // PlayStation rooms send both analog sticks (keyboard T/F/G/H and I/J/K/L, gamepad sticks).
  const dual = !!profile.dualAnalog
  const allowed = new Set(inputIndices(core))
  // Same keys as the RetroOasis player (see keyboardLayout in lan-capabilities.js).
  const keys = keyboardLayout(core).keys
  let padStick = [0, 0], padStick2 = [0, 0], touchStick = [0, 0], stickPointer = null
  // N64: hold Shift for a half tilt, so keyboard players can walk as well as run.
  let walking = false
  const controls = document.querySelector('.ro-lan-controls')
  const labels = BUTTON_LABELS[core] ?? {}
  controls.replaceChildren()
  if (n64 || dual) {
    const stick = document.createElement('div')
    stick.className = 'ro-lan-stick'; stick.setAttribute('role', 'group'); stick.setAttribute('aria-label', n64 ? 'Analog stick. Drag to move or use keyboard arrows.' : 'Left analog stick. Drag to move or use T/F/G/H.'); stick.tabIndex = 0
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
  } else if (dual) {
    // Laid out like a DualShock: the four shoulders in a row, the face buttons as a diamond.
    group('Shoulder buttons', [[10, 'L1'], [12, 'L2'], [13, 'R2'], [11, 'R1']], 'ro-lan-buttons ro-lan-shoulders ro-lan-shoulders4')
    group('Face buttons', [[9, '△'], [1, '□'], [8, '○'], [0, '✕']], 'ro-lan-facepad')
  } else group('Game buttons', Object.entries(labels).filter(([index]) => allowed.has(Number(index))).map(([index, label]) => [Number(index), label]), 'ro-lan-buttons')
  group('Start and select', [[3, 'Start'], ...(core === 'segaMD' || n64 ? [] : [[2, 'Select']])], 'ro-lan-system')
  function transmit(force = false) {
    if (!active) return
    const held = new Set([...keyboard.values(), ...pointers.values(), ...gamepad])
    const buttons = [...held].filter(index => profile.buttons.includes(index)).sort((a, b) => a - b)
    const keyStick = keyboardStick(held, walking)
    const stick = touchStick.some(Boolean) ? touchStick : keyStick.some(Boolean) ? keyStick : padStick
    const keyStick2 = keyboardStick(held, false, 20)
    const stick2 = keyStick2.some(Boolean) ? keyStick2 : padStick2
    const key = `${buttons.join(',')}/${stick.join(',')}/${dual ? stick2.join(',') : ''}`
    const now = performance.now()
    if (key !== last) changedAt = now
    // The controls channel drops late packets instead of resending them, so a change is
    // repeated every frame for a moment: a lost tap or release is covered by the next copy.
    const gap = now - changedAt < 120 ? 15 : 250
    if (!force && key === last && now - lastSent < gap) return
    last = key; lastSent = now
    send(JSON.stringify({ type: 'controls', v: LAN_PROTOCOL, seq: controlSequence++, buttons, ...(n64 || dual ? { stick } : {}), ...(dual ? { stick2 } : {}) }))
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
  const release = () => { walking = false; padGate.reset(); keyboard.clear(); gamepad.clear(); touchStick = [0, 0]; padStick = [0, 0]; padStick2 = [0, 0]; stickPointer = null; const thumb = controls.querySelector('.ro-lan-stick i'); if (thumb) thumb.style.transform = ''; pointers.clear() }
  const visibility = () => { if (document.hidden) release() }
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey)
  window.addEventListener('blur', release); document.addEventListener('visibilitychange', visibility)
  const poll = () => {
    if (!active) return
    gamepad = new Set()
    padStick = [0, 0]; padStick2 = [0, 0]
    if (document.hasFocus() && !document.hidden) {
      try {
        const pads = readControllers().pads
        // A chip in the top bar confirms the controller is seen (it's otherwise silent).
        if (padChip && padChip.hidden === pads.length > 0) padChip.hidden = !pads.length
        const pad = padGate.read(padSelector.read(pads))
        if (pad) {
          const input = gamepadControls(pad, core)
          gamepad = new Set(input.buttons)
          padStick = input.stick
          padStick2 = input.stick2 ?? [0, 0]
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
  roster(lobby.querySelector('[data-lobby-seats]'), room, null, null, playerId)
  // Seat chips in the top bar: who is here at a glance, yours outlined.
  const strip = document.querySelector('[data-lan-strip]')
  if (strip) {
    strip.replaceChildren(...Array.from({ length: room.maxPlayers }, (_, slot) => {
      const player = room.players.find(p => p.slot === slot)
      const chip = document.createElement('li')
      chip.className = 'ro-seat-strip__chip'
      chip.dataset.slot = slot
      chip.dataset.state = !player ? 'open' : player.connected ? 'in' : 'away'
      if (player?.id === me.id) chip.dataset.me = 'true'
      chip.textContent = `P${slot + 1}`
      chip.title = player ? `Player ${slot + 1}: ${player.nickname}${player.connected ? '' : ' (reconnecting)'}` : `Player ${slot + 1}: open`
      return chip
    }))
  }
  const capacity = document.querySelector('[data-lan-capacity]')
  const summary = roomSummary(room)
  if (capacity.textContent !== summary) capacity.textContent = summary
  document.querySelector('[data-lan-title]').textContent = `${room.title} · ${CORE_LABELS[room.core] || room.core}`
  document.querySelector('[data-lan-slot]').textContent = `You · Player ${me.slot + 1} · ${me.nickname}`
  if (previousHost === host.socketId && peer) { refreshLobby(); return }
  closePeer()
  previousHost = host.socketId
  slow = false
  const stream = new MediaStream()
  const currentPeer = createPeer(socket, host.socketId, event => {
    if (peer !== currentPeer) return
    lowLatencyReceiver(event.receiver)
    stream.addTrack(event.track)
    video.srcObject = stream
    void startVideo()
  }, state => {
    if (peer !== currentPeer) return
    if (state === 'connected') { clearTimeout(timeout); slow = false; enableInput(); status(video.muted && !soundChoice ? 'Connected! Press any key or tap the game to turn on sound.' : 'Connected. Have fun!') }
    if (state === 'connected') autoRetries = 0
    if (['failed', 'disconnected'].includes(state)) {
      guestInput?.dispose(); guestInput = null
      scheduleAutoReconnect(currentPeer)
    }
    refreshLobby()
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
      // Back on a working connection: the interrupted / lost notice goes.
      if (peer?.pc.connectionState === 'connected') { trouble = null; autoRetries = 0 }
      enableInput()
      refreshLobby()
    }
    channel.onmessage = event => {
      if (channel !== incoming || typeof event.data !== 'string') return
      let data
      try { data = JSON.parse(event.data) } catch { return }
      if (data?.type === 'state' && typeof data.paused === 'boolean') showHostPause(data.paused)
    }
    // The controls channel closing is the quickest sign the host dropped this connection
    // (ICE takes 5–10 s to report it), so the automatic rejoin starts from here.
    channel.onclose = () => { if (channel !== incoming) return; guestInput?.dispose(); guestInput = null; scheduleAutoReconnect(peer); refreshLobby() }
  }
  timeout = setTimeout(() => { slow = true; refreshLobby(); status('Connection timed out. Both devices must use the same LAN; guest Wi-Fi/client isolation can prevent joining.') }, 15000)
}
function attachCart(channel) {
  cartChannel = channel
  channel.binaryType = 'arraybuffer'
  const receive = fileReceiver({
    limits: { save: SAVE_LIMIT, sync: SAVE_LIMIT },
    onFile: file => {
      // 'sync' arrives on every in-game save and is only kept; 'save' was asked for (or is final) and downloads.
      keepSave(file, file.kind === 'save')
      // The host counts a save as delivered only after this receipt.
      if (channel.readyState === 'open') channel.send(JSON.stringify({ type: 'received', kind: file.kind }))
      if (file.kind === 'save') cartStatus.textContent = `Downloaded ${file.name}. Load it in your emulator or RetroOasis Saves to keep your trade.`
      refreshCart()
    },
    onError: error => { cartStatus.textContent = error.message },
    onMessage: data => {
      if (data.type === 'hello') {
        linkRunning = data.running === true
        linkEnded = data.ended === true
        if (linkEnded) cartStatus.textContent = 'This link session has ended. Ask the host to open a new one to link again.'
        // A new game connection before the link starts means the host needs the cartridge again.
        if (!linkRunning) cartInserted = false
        if (typeof data.accept === 'string') cartForm.elements.rom.accept = data.accept
        if (!linkRunning && !cartInserted && !linkEnded) cartStatus.textContent = `Insert your ${room.core === 'gba' ? 'Game Boy Advance' : 'Game Boy / Game Boy Color'} game to link with ${data.title || 'the host'}.`
        if (linkRunning) cartStatus.textContent = 'The link is running. Play on Console 2.'
      } else if (data.type === 'session') {
        linkRunning = data.running === true
        if (!linkRunning) linkEnded = true
        cartStatus.textContent = linkRunning ? 'Linked! Use the game’s trade or link menu, then save in-game; each save is sent here automatically.' : 'The host ended the link session. Keep your downloaded save file.'
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
    cartStatus.textContent = `Sending ${cartTitle(rom.name) || info.title} to the host…`
    await sendFile(channel, 'rom', rom.name, rom.bytes)
    if (saveFile) await sendFile(channel, 'save', saveFile.name, new Uint8Array(await saveFile.arrayBuffer()))
    cartInserted = true
    // Back to the lobby (the form sits below it): the game appears there when the host starts.
    playView.scrollIntoView({ block: 'start', behavior: 'smooth' })
  } catch (error) { cartStatus.textContent = error.message }
  finally { button.disabled = false; refreshCart() }
}
requestSave.onclick = () => {
  if (linkRunning && cartChannel?.readyState === 'open') {
    cartChannel.send(JSON.stringify({ type: 'request-save' }))
    cartStatus.textContent = 'Requesting your save…'
  } else if (latestSave) {
    // The link is over or the host is unreachable: the copy kept here is the latest.
    downloadBytes(latestSave.bytes, latestSave.name)
    latestSave.downloaded = true
    cartStatus.textContent = `Downloaded ${latestSave.name}. Load it in your emulator or RetroOasis Saves to keep your trade.`
    refreshCart()
  }
}
window.addEventListener('beforeunload', event => { if (latestSave && !latestSave.downloaded) { event.preventDefault(); event.returnValue = '' } })
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
    document.querySelector('[data-lan-input-hint]').textContent = keyboardLayout(room.core).hint + (room.core === 'n64' ? ' Gamepad: left stick moves, right stick uses C-buttons, triggers use Z.' : ROOM_PROFILES[room.core]?.dualAnalog ? ' Gamepad: both sticks are analog; games that support the DualShock use them.' : '')
    document.querySelector('[data-lan-input-hint]').textContent += ' If a controller seems stuck, release its buttons and center the sticks.'
    update(room)
    status('Joined. Connecting to the host’s game…')
  } catch (error) { if (attempt === generation) end(error.message) }
  finally { if (attempt === generation) { joining = false; joinForm.querySelector('button').disabled = false } }
}
video.onplaying = refreshLobby
video.onloadeddata = refreshLobby
sound.onclick = async () => {
  soundChoice = true
  video.muted = !video.muted
  try { await video.play(); sound.textContent = video.muted ? 'Enable sound' : 'Mute sound' }
  catch { video.muted = true; sound.textContent = 'Enable sound'; status('Audio is not ready. Try Enable sound after the stream connects.') }
}
// Browsers only allow sound after the player interacts, so the stream starts muted. The
// first tap, click or key press while playing turns sound on (unless they used the
// button themselves); a muted stream with a working game is easy to miss.
let soundChoice = false
async function autoSound(event) {
  if (soundChoice || playView.hidden || !video.muted || !video.srcObject?.getAudioTracks().length) return
  if (event.target?.closest?.('#sound, input, textarea, select')) return
  soundChoice = true
  video.muted = false
  try { await video.play(); sound.textContent = 'Mute sound'; if (/turn (on|sound back on)/.test(liveLine?.textContent || '')) status('Sound on.') }
  catch { video.muted = true; soundChoice = false }
}
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, event => { void autoSound(event) }, { capture: true })
// iPad Safari only has the prefixed call; iPhone Safari can't make a page element
// fullscreen at all, so the button goes rather than doing nothing.
const fullscreenButton = document.querySelector('#fullscreen')
const enterFullscreen = playView.requestFullscreen ?? playView.webkitRequestFullscreen
if (!enterFullscreen) fullscreenButton.hidden = true
fullscreenButton.onclick = () => {
  try { void Promise.resolve(enterFullscreen.call(playView)).catch(() => status('Fullscreen is unavailable in this browser.')) }
  catch { status('Fullscreen is unavailable in this browser.') }
}
document.querySelector('#leave').onclick = () => {
  if (joining) return
  end('You left the room.')
  joining = true
  joinForm.querySelector('button').disabled = true
  void request(socket, 'room:leave').catch(() => {}).finally(() => { joining = false; joinForm.querySelector('button').disabled = false })
}
function reconnect() {
  clearTimeout(autoTimer); autoTimer = null
  rejoining = !!socket?.connected // A planned rejoin: the disconnect that follows is not news.
  guestInput?.release(); closePeer()
  if (socket) { socket.disconnect(); socket.connect() }
}
// A dropped game connection (Wi-Fi blip, host tab busy) is retried on its own: WebRTC
// often recovers from 'disconnected' by itself, so wait first, then rejoin with the
// same seat, backing off 2 s, 4 s, 8 s. After that it's the guest's call.
const AUTO_RETRIES = 3
let autoRetries = 0, autoTimer = null, rejoining = false
function scheduleAutoReconnect(lostPeer) {
  if (autoTimer || ended) return
  if (autoRetries >= AUTO_RETRIES) {
    trouble = 'lost'; refreshLobby()
    status('Game connection lost. Tap Reconnect to retry on the same LAN.')
    return
  }
  const wait = 2000 * 2 ** autoRetries
  trouble = 'reconnecting'; refreshLobby()
  status(`Connection interrupted. Reconnecting automatically (attempt ${autoRetries + 1} of ${AUTO_RETRIES})…`)
  autoTimer = setTimeout(() => {
    autoTimer = null
    // Recovered by itself only if both the media and the controls are back: after the host
    // closes its side, this page's connection keeps reading 'connected' for ~8 s.
    if (ended || peer !== lostPeer || (peer?.pc.connectionState === 'connected' && channel?.readyState === 'open')) return
    autoRetries++
    reconnect()
  }, wait)
}
document.querySelector('#reconnect').onclick = lobby.querySelector('[data-lobby-action]').onclick = () => { autoRetries = 0; trouble = 'reconnecting'; reconnect(); refreshLobby() }
retryService.onclick = () => {
  retryService.hidden = true
  status('Reconnecting to the room host…')
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
  socket.on('disconnect', () => { generation++; joining = false; joinForm.querySelector('button').disabled = true; retryService.hidden = rejoining; guestInput?.release(); closePeer(); if (rejoining) { rejoining = false; return } status(!ended && room ? 'Room host disconnected. Trying to reconnect…' : 'Room host disconnected. Retry when the host server is back.') })
  socket.on('connect', () => { retryService.hidden = true; if (!ended && resumeToken) void join(true); else { joinForm.querySelector('button').disabled = false; status('Ready. Enter the room code and your name.') } })
  socket.on('connect_error', () => { retryService.hidden = false; status('Can’t reach the room host. Retry once it’s running again.') })
  socket.io.on('reconnect_failed', () => { if (!ended && room) status('The room host is still unavailable. Tap Reconnect when it’s back.') })
  joinForm.querySelector('button').disabled = false
  retryService.hidden = true
  status('Ready. Enter the room code and your name.')
} catch (error) { joinForm.querySelector('button').disabled = true; retryService.hidden = false; status(error.message) }
}
void initialize()

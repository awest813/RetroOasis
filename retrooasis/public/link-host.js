import { mountHost } from './lan-host.js'
import { keyboardControl, buttonHolds } from './lan-shared.js'
import { LINK_CAPABILITIES, gamepadControls } from './lan-capabilities.js'
import { readControllers, ControllerSelector, ControllerGate } from './controller-input.js'
import { createLinkSession, cartridgeInfo, validSaveSize } from './link-session.js'
import { readRomReference, unwrapRom } from './rom-source.js'
import { fileReceiver, sendFile, downloadBytes, saveName, SAVE_LIMIT } from './link-transfer.js'
import { librarySaveKey, readLibrarySave, writeLibrarySave } from './library-saves.js'

const params = new URLSearchParams(location.search)
const system = params.get('system')
const statusLine = document.querySelector('[data-link-status]')
const setStatus = message => { statusLine.textContent = message }
const guestLabel = document.querySelector('[data-link-guest]')
const canvases = [document.querySelector('#console-1'), document.querySelector('#console-2')]
const contexts = canvases.map(canvas => canvas.getContext('2d'))
const buttons = Object.fromEntries(['start', 'pause', 'my-save', 'save-library', 'guest-save', 'end'].map(id => [id, document.querySelector('#' + id)]))
const setupForm = document.querySelector('#link-setup')
const back = params.get('back')
if (back && /^\.\/#\/[^\s]*$/.test(back)) document.querySelector('[data-link-back]').href = back

let host = null // { name, bytes, info }
let guest = null // { name, bytes, save, info, socketId, nickname, channel }
let session = null
let roomPanel = null
const narrow = matchMedia('(max-width: 899px)')
let paused = false
let sessionEnded = false
let frame = 0
const audioContext = new AudioContext()
const outputs = [audioContext.createGain(), audioContext.createGain()]
outputs[0].connect(audioContext.destination) // Console 2's sound goes only to the guest stream.
const nextAudio = [0, 0]

function placeholder(slot, text) {
  const ctx = contexts[slot], canvas = canvases[slot]
  ctx.fillStyle = '#071018'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#e8eef5'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center'
  text.split('\n').forEach((line, index) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 6 + index * 14))
}

function message(channel, payload) { if (channel?.readyState === 'open') channel.send(JSON.stringify(payload)) }
function refreshButtons() {
  const running = !!session
  buttons.start.disabled = running || !host || !guest?.bytes
  buttons.start.hidden = running || sessionEnded
  for (const id of ['pause', 'my-save', 'end']) buttons[id].hidden = !running
  buttons['save-library'].hidden = !running || !host?.saveKey
  buttons['guest-save'].hidden = !running || guest?.channel?.readyState !== 'open'
  buttons.pause.textContent = paused ? 'Resume both' : 'Pause both'
  touchPad.hidden = !running
  setupForm.hidden = running || sessionEnded
}

function setPaused(value) {
  paused = value
  emu.paused = value
  session?.setPaused(value)
  for (const slot of [0, 1]) nextAudio[slot] = 0
  refreshButtons()
}

// EmulatorJS-shaped adapter so the shared room host (invites, roster, reconnects,
// WebRTC streaming and guest input) drives Console 2.
const emu = {
  canvas: canvases[1],
  paused: false,
  config: { gameName: 'Trade & link' },
  getCore: () => system,
  gameManager: {
    audioContext, audioNode: outputs[1],
    functions: { simulateInput: (player, index, value) => { if (player === 1) session?.key(1, index, value) } },
  },
  on() {},
  pause() { if (session) setPaused(true) },
  play() { if (session) setPaused(false) },
}

function playAudio(slot, samples) {
  const frames = samples.length / 2
  if (!frames || audioContext.state !== 'running') return
  const buffer = audioContext.createBuffer(2, frames, session.sampleRate)
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1)
  for (let i = 0; i < frames; i++) { left[i] = samples[i * 2] / 32768; right[i] = samples[i * 2 + 1] / 32768 }
  const now = audioContext.currentTime
  // Keep latency bounded: restart the queue if it fell behind or ran far ahead.
  if (nextAudio[slot] < now + 0.02 || nextAudio[slot] > now + 0.25) nextAudio[slot] = now + 0.05
  const source = audioContext.createBufferSource()
  source.buffer = buffer; source.connect(outputs[slot]); source.start(nextAudio[slot])
  nextAudio[slot] += buffer.duration
}

let images = []
let previous = null
function tick(now) {
  if (!session) return
  const elapsed = previous === null ? 0 : Math.min(100, now - previous)
  previous = now
  pollHostInput()
  if (!paused && !document.hidden) {
    session.advance(elapsed)
    for (const slot of [0, 1]) {
      session.pixels(slot, images[slot].data)
      contexts[slot].putImageData(images[slot], 0, 0)
      playAudio(slot, session.audio(slot))
    }
  } else for (const slot of [0, 1]) session.audio(slot) // Discard samples produced before the pause.
  frame = requestAnimationFrame(tick)
}

// Host controls for Console 1: keyboard and the first active gamepad.
const keyMap = { ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, KeyZ: 0, KeyX: 8, Enter: 3, ShiftLeft: 2, ShiftRight: 2, KeyQ: 10, KeyW: 11 }
const allowed = new Set(LINK_CAPABILITIES[system]?.buttons || [])
const keyboard = new Map()
let padButtons = new Set(), applied = new Set()
const padSelector = new ControllerSelector(), padGate = new ControllerGate()
const touch = buttonHolds(() => applyHostInput())
function applyHostInput() {
  const held = new Set([...keyboard.values(), ...padButtons, ...touch.values()])
  for (const index of applied) if (!held.has(index)) session?.key(0, index, false)
  for (const index of held) if (!applied.has(index)) session?.key(0, index, true)
  applied = session && !paused ? held : new Set()
}
function pollHostInput() {
  padButtons = new Set()
  if (document.hasFocus() && !document.hidden) {
    try { const pad = padGate.read(padSelector.read(readControllers().pads)); if (pad) padButtons = new Set(gamepadControls(pad, system).buttons) }
    catch { /* Gamepads can be unavailable on plain-HTTP origins. */ }
  } else padGate.reset()
  applyHostInput()
}
const onKey = event => { if (session && keyboardControl(event, keyMap, allowed, keyboard)) applyHostInput() }
const releaseHost = () => { keyboard.clear(); padButtons.clear(); padGate.reset(); touch.clear() }
// On-screen controls for tablet / phone hosts (shown for coarse pointers by CSS).
const touchPad = document.querySelector('[data-link-touch]')
function buildTouchControls() {
  const groups = [['Directional controls', 'ro-lan-dpad', [[4, '↑'], [6, '←'], [5, '↓'], [7, '→']]],
    ['Game buttons', 'ro-lan-buttons', [[0, 'B'], [8, 'A'], ...(system === 'gba' ? [[10, 'L'], [11, 'R']] : [])]],
    ['Start and select', 'ro-lan-system', [[3, 'Start'], [2, 'Select']]]]
  for (const [label, className, controls] of groups) {
    const group = document.createElement('div')
    group.className = className; group.setAttribute('role', 'group'); group.setAttribute('aria-label', label)
    for (const [index, name] of controls) {
      const button = document.createElement('button')
      button.type = 'button'; button.textContent = name; button.setAttribute('aria-label', `Console 1 ${name}`)
      button.onpointerdown = event => { if (!session || event.button !== 0) return; event.preventDefault(); button.setPointerCapture(event.pointerId); touch.press(event.pointerId, index) }
      button.onpointerup = event => touch.release(event.pointerId)
      button.onpointercancel = event => touch.cancel(event.pointerId)
      button.onlostpointercapture = event => touch.lostCapture(event.pointerId)
      button.onclick = event => { if (!session || event.detail !== 0) return; const tap = Symbol('tap'); touch.press(tap, index); touch.release(tap) }
      group.append(button)
    }
    touchPad.append(group)
  }
}
window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey)
window.addEventListener('blur', releaseHost)
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseHost(); previous = null })

async function loadCore(name, options = {}) {
  const { default: create } = await import(`/link/${name}`)
  return create(options)
}
async function loadFile(name) {
  const response = await fetch(`/link/${name}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Build the link cores on the host computer with npm run oasis:lan:link.')
  return new Uint8Array(await response.arrayBuffer())
}

function onGuestFile(file) {
  if (!guest || session) return
  if (file.kind === 'rom') {
    try {
      const info = cartridgeInfo(system, file.bytes)
      guest.bytes = file.bytes; guest.name = file.name; guest.info = info; guest.save = null
      guestLabel.textContent = `Console 2 · ${guest.nickname} · ${info.title}`
      placeholder(1, `${info.title}\nReady to link`)
      message(guest.channel, { type: 'status', text: `Cartridge received: ${info.title}. Waiting for the host to start the link.` })
      setStatus(`${guest.nickname} inserted ${info.title}. Choose Start link when you’re both ready.`)
    } catch (error) {
      guest.bytes = null
      message(guest.channel, { type: 'error', text: error.message })
      setStatus(`${guest.nickname}’s cartridge was refused: ${error.message}`)
    }
  } else if (file.kind === 'save' && guest.bytes) {
    if (!validSaveSize(system, file.bytes.length)) { message(guest.channel, { type: 'error', text: 'That save file does not match this system.' }); return }
    guest.save = file.bytes
    message(guest.channel, { type: 'status', text: 'Save received. Waiting for the host to start the link.' })
  }
  refreshButtons()
}

async function sendGuestSave(final = false) {
  const channel = guest?.channel
  const bytes = session?.exportSave(1)
  if (!bytes) { message(channel, { type: 'error', text: 'This cartridge has no battery save.' }); return false }
  if (channel?.readyState !== 'open') return false
  try {
    await sendFile(channel, 'save', saveName(guest.name), bytes)
    message(channel, { type: 'status', text: final ? 'Session ended. Your final save was sent; keep the downloaded file.' : 'Save sent. Keep the downloaded file for your game.' })
    return true
  } catch { return false }
}

function onPeer(peer, player) {
  if (session && guest) {
    // A running link keeps Console 2's cartridge; whoever holds the seat controls it.
    if (guest.nickname !== player.nickname) setStatus(`${player.nickname} now controls Console 2 (${guest.info.title}).`)
    guest.nickname = player.nickname
  } else guest = { nickname: player.nickname, bytes: null, save: null }
  guest.socketId = player.socketId
  const channel = peer.pc.createDataChannel('cart', { ordered: true })
  channel.binaryType = 'arraybuffer'
  guest.channel = channel
  const receive = fileReceiver({
    limits: { rom: LINK_CAPABILITIES[system].maxRom, save: SAVE_LIMIT },
    onFile: onGuestFile,
    onError: error => message(channel, { type: 'error', text: error.message }),
    onMessage: data => {
      if (data.type === 'request-save') void sendGuestSave().then(sent => { if (sent) setStatus(`Sent ${guest.nickname} their save.`) })
    },
  })
  channel.onmessage = event => { if (guest?.channel === channel) receive(event.data) }
  channel.onopen = () => {
    message(channel, { type: 'hello', system, title: host?.info.title, running: !!session, accept: system === 'gb' ? '.gb,.gbc,.zip' : '.gba,.zip' })
    if (!session) guestLabel.textContent = `Console 2 · ${player.nickname} · inserting a cartridge…`
    refreshButtons()
  }
  channel.onclose = refreshButtons
}

function onDrop() {
  if (!session) { guest = null; guestLabel.textContent = 'Console 2 · Waiting for a guest'; placeholder(1, 'Waiting for a guest'); refreshButtons(); return }
  if (!paused) setPaused(true)
  setStatus('The guest disconnected, so both consoles are paused mid-link. Resume once they reconnect.')
  refreshButtons()
}

buttons.start.onclick = async () => {
  if (session || !host || !guest?.bytes) return
  buttons.start.disabled = true
  setStatus('Starting both consoles…')
  try {
    const file = setupForm.elements.save.files?.[0]
    // A chosen file wins; otherwise the game's RetroOasis save, unless the host opted out.
    let hostSave = !file && setupForm.elements.library?.checked ? host.librarySave?.bytes ?? null : null
    if (file) {
      if (file.size > SAVE_LIMIT || !validSaveSize(system, file.size)) throw new Error('Your save file does not match this system.')
      hostSave = new Uint8Array(await file.arrayBuffer())
    }
    void audioContext.resume().catch(() => {})
    session = await createLinkSession({ system, carts: [host.bytes, guest.bytes], saves: [hostSave, guest.save], loadCore, loadFile })
    images = [0, 1].map(() => new ImageData(session.width, session.height))
    paused = false; emu.paused = false; previous = null
    frame = requestAnimationFrame(tick)
    message(guest.channel, { type: 'session', running: true })
    if (narrow.matches && roomPanel) roomPanel.querySelector('details').open = false
    setStatus(`Linked: ${host.info.title} ↔ ${guest.info.title}. Use the game’s trade or link menu on both consoles.`)
  } catch (error) {
    session?.close(); session = null
    setStatus(error.message)
  }
  refreshButtons()
}
buttons.pause.onclick = () => setPaused(!paused)
buttons['my-save'].onclick = () => {
  const bytes = session?.exportSave(0)
  if (!bytes) { setStatus('This cartridge has no battery save.'); return }
  downloadBytes(bytes, saveName(host.name))
  setStatus('Your save was downloaded. Import it in RetroOasis Saves or your emulator to keep the trade.')
}
async function saveToLibrary(bytes) {
  const { backedUp } = await writeLibrarySave(host.saveKey, bytes)
  return backedUp ? 'Your RetroOasis save was updated; the previous one is kept as a “.before-trade” copy in Saves.' : 'Your RetroOasis save was updated.'
}
buttons['save-library'].onclick = async () => {
  const bytes = session?.exportSave(0)
  if (!bytes) { setStatus('This cartridge has no battery save.'); return }
  try { setStatus(await saveToLibrary(bytes) + ' Close other tabs playing this game so they don’t overwrite it.') }
  catch (error) { setStatus(`Couldn’t update your RetroOasis save: ${error.message} Use Download my save instead.`) }
}
buttons['guest-save'].onclick = () => void sendGuestSave().then(sent => setStatus(sent ? `Sent ${guest.nickname} their save.` : 'Could not send the guest’s save. Ask them to reconnect.'))
buttons.end.onclick = async () => {
  if (!session) return
  setPaused(true)
  const mine = session.exportSave(0)
  await sendGuestSave(true)
  let saved = 'This cartridge has no battery save.'
  if (mine && host.saveKey) {
    try { saved = await saveToLibrary(mine) }
    catch (error) { downloadBytes(mine, saveName(host.name)); saved = `Couldn’t update your RetroOasis save (${error.message}), so it was downloaded instead.` }
  } else if (mine) { downloadBytes(mine, saveName(host.name)); saved = 'Your save was downloaded.' }
  cancelAnimationFrame(frame)
  releaseHost()
  session.close(); session = null; sessionEnded = true
  message(guest?.channel, { type: 'session', running: false })
  placeholder(0, 'Session ended'); placeholder(1, 'Session ended')
  setStatus(`Session ended. ${saved} Your guest received theirs.`)
  refreshButtons()
}
window.addEventListener('beforeunload', event => { if (session) { event.preventDefault(); event.returnValue = '' } })
window.addEventListener('pagehide', () => { session?.close(); session = null })

async function start() {
  // Native size from the start: the guest's stream keeps the canvas size it began with.
  canvases.forEach(canvas => { canvas.width = system === 'gba' ? 240 : 160; canvas.height = system === 'gba' ? 160 : 144 })
  placeholder(0, 'Loading cartridge…'); placeholder(1, 'Waiting for a guest')
  if (!LINK_CAPABILITIES[system]) throw new Error('This system has no link cable support.')
  const rom = await unwrapRom(await readRomReference(params.get('rom')))
  const info = cartridgeInfo(system, rom.bytes)
  host = { ...rom, info, saveKey: librarySaveKey(rom.name) }
  host.librarySave = await readLibrarySave(host.saveKey).catch(() => null)
  const library = document.querySelector('[data-link-library]')
  if (host.librarySave && validSaveSize(system, host.librarySave.bytes.length)) {
    library.hidden = false
    library.querySelector('span').textContent = `Use my RetroOasis save (last saved ${host.librarySave.modified.toLocaleString()})`
  } else host.librarySave = null
  const title = params.get('name') || info.title
  document.querySelector('[data-link-title]').textContent = title
  document.title = `RetroOasis · Trade & link · ${title}`
  emu.config.gameName = title
  buildTouchControls()
  placeholder(0, `${info.title}\nReady`)
  setStatus('Create a room in the Link room panel, then share the invite with your guest.')
  const { panel } = await mountHost(emu, {
    heading: 'Link room', onPeer, onDrop,
    note: 'Keep this page and the LAN server open. Your guest plays Console 2 with their own cartridge and save; their screen streams from here.',
  })
  // In the page flow, so on narrow screens it never covers the consoles or touch controls.
  roomPanel = panel
  document.querySelector('[data-link-room]').append(panel)
  refreshButtons()
}
start().catch(error => { setStatus(error.message); placeholder(0, 'Cartridge unavailable') })

import { mountHost } from './lan-host.js'
import { keyboardControl, buttonHolds } from './lan-shared.js'
import { LINK_CAPABILITIES, gamepadControls, keyboardLayout } from './lan-capabilities.js'
import { readControllers, ControllerSelector, ControllerGate } from './controller-input.js'
import { createLinkSession, cartridgeInfo, cartTitle, validSaveSize, saveSettler } from './link-session.js'
import { readRomReference, unwrapRom } from './rom-source.js'
import { fileReceiver, sendFile, downloadBytes, saveName, SAVE_LIMIT } from './link-transfer.js'
import { libraryCartSave, writeLibrarySave } from './library-saves.js'

const params = new URLSearchParams(location.search)
const system = params.get('system')
const statusLine = document.querySelector('[data-link-status]')
const setStatus = message => { statusLine.textContent = message }
const syncLine = document.querySelector('[data-link-sync]')
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
// Automatic save sync: every few seconds both battery saves are sampled; once an
// in-game save settles, Console 1's goes to the RetroOasis library and Console 2's
// to the guest's page, where it waits ready to download.
const SYNC_MS = 3000
let syncTimer = 0
let settlers = []
let guestSync = null // Console 2's latest settled save, until the guest's page has it.
let libraryBackupPending = true
let sessionBackedUp = false
let sends = Promise.resolve()
let libraryWrites = Promise.resolve()
const audioContext = new AudioContext()
const outputs = [audioContext.createGain(), audioContext.createGain()]
outputs[0].connect(audioContext.destination) // Console 2's sound goes only to the guest stream.
const nextAudio = [0, 0]

function placeholder(slot, text) {
  const ctx = contexts[slot], canvas = canvases[slot]
  ctx.fillStyle = '#071018'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#e8eef5'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center'
  text.split('\n').forEach((line, index) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 6 + index * 14, canvas.width - 12))
}

function message(channel, payload) { if (channel?.readyState === 'open') channel.send(JSON.stringify(payload)) }
// The setup tracker: each step is done, current (the next thing to do) or waiting.
const stepList = document.querySelector('[data-link-steps]')
function refreshSteps() {
  if (!stepList) return
  const roomOpen = roomPanel?.querySelector('[data-lan-room]')?.hidden === false
  const done = { cart: !!host, room: roomOpen || !!session, guest: !!guest?.bytes || !!session, start: !!session }
  stepList.hidden = sessionEnded
  let current = false
  for (const item of stepList.children) {
    const isDone = done[item.dataset.step]
    item.dataset.status = isDone ? 'done' : current ? 'waiting' : 'current'
    if (!isDone) current = true
    item.setAttribute('aria-current', item.dataset.status === 'current' ? 'step' : 'false')
  }
}
setInterval(refreshSteps, 500)
function refreshButtons() {
  refreshSteps()
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
// Same keys as the RetroOasis player.
const { keys: keyMap, hint: keyHint } = keyboardLayout(system)
const hintLine = document.querySelector('[data-link-hint]')
if (hintLine && keyHint) hintLine.textContent = `${keyHint} A game controller works too.`
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
      button.type = 'button'; button.textContent = name; button.setAttribute('aria-label', `Game ${name}`)
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
  if (!guest || session || sessionEnded) return
  if (file.kind === 'rom') {
    try {
      const parsed = cartridgeInfo(system, file.bytes)
      const info = { ...parsed, title: cartTitle(file.name) || parsed.title }
      guest.bytes = file.bytes; guest.name = file.name; guest.info = info; guest.save = null
      guestLabel.textContent = `${guest.nickname} · ${info.title}`
      placeholder(1, `${info.title}\nReady`)
      message(guest.channel, { type: 'status', text: `Got your game (${info.title}). Waiting for the host to start.` })
      setStatus(`${guest.nickname} added ${info.title}. Choose Start when you’re both ready.`)
    } catch (error) {
      guest.bytes = null
      message(guest.channel, { type: 'error', text: error.message })
      setStatus(`${guest.nickname}’s game couldn’t be used: ${error.message}`)
    }
  } else if (file.kind === 'save' && guest.bytes) {
    if (!validSaveSize(system, file.bytes.length)) { message(guest.channel, { type: 'error', text: 'That save file does not match this system.' }); return }
    guest.save = file.bytes
    message(guest.channel, { type: 'status', text: 'Got your save. Waiting for the host to start.' })
  }
  refreshButtons()
}

// One file at a time on the cart channel: the receiver rejects interleaved files.
// A file counts as delivered only when the guest's page confirms it: a channel can
// still read 'open' for seconds after the guest's Wi-Fi drops.
const ACK_MS = 8000
let ackWaiter = null // { kind, done }
function queueFile(channel, kind, name, bytes) {
  const send = sends.then(async () => {
    const received = new Promise((resolve, reject) => {
      const fail = () => { clearTimeout(timer); channel.removeEventListener('close', fail); ackWaiter = null; reject(new Error('The guest’s page didn’t confirm the file.')) }
      const timer = setTimeout(fail, ACK_MS)
      channel.addEventListener('close', fail)
      ackWaiter = { kind, done: () => { clearTimeout(timer); channel.removeEventListener('close', fail); ackWaiter = null; resolve() } }
    })
    received.catch(() => {})
    await sendFile(channel, kind, name, bytes)
    await received
  })
  sends = send.catch(() => {})
  return send
}

/** 'sent', 'no-battery' or 'failed'. */
async function sendGuestSave(final = false) {
  const channel = guest?.channel
  const bytes = session?.exportSave(1)
  if (!bytes) { message(channel, { type: 'error', text: 'This game doesn’t save.' }); return 'no-battery' }
  // The room already reported them gone: don't wait for a receipt that can't come.
  if (channel?.readyState !== 'open' || guest.connected === false) return 'failed'
  try {
    await queueFile(channel, 'save', saveName(guest.name), bytes)
    guestSync = null
    message(channel, { type: 'status', text: final ? 'All done. Your final save was downloaded; keep that file.' : 'Your save was downloaded. Keep that file for your game.' })
    return 'sent'
  } catch { return 'failed' }
}
const guestSaveStatus = result => result === 'sent' ? `Sent ${guest.nickname} their save.`
  : result === 'no-battery' ? 'This game doesn’t save, so there’s nothing to send.'
  : 'Could not send the guest’s save. Ask them to reconnect.'

async function deliverGuestSync() {
  const channel = guest?.channel, bytes = guestSync
  if (!bytes || channel?.readyState !== 'open') return
  try {
    await queueFile(channel, 'sync', saveName(guest.name), bytes)
    if (guestSync === bytes) guestSync = null
    showSync('guest', `${guest.nickname}’s page has their latest save`)
  } catch {} // Kept in guestSync; sent again when they reconnect.
}

// One line per side, so a guest delivery never hides the library update (or vice versa).
const syncNotes = { library: '', guest: '' }
function showSync(side, text) {
  syncNotes[side] = `${text} (${new Date().toLocaleTimeString()})`
  if (syncLine) syncLine.textContent = `Auto-saved: ${[syncNotes.library, syncNotes.guest].filter(Boolean).join(' · ')}.`
}

let syncing = null
function syncSaves() {
  if (!session || syncing) return syncing
  const theirs = session.exportSave(1), mine = session.exportSave(0)
  if (settlers[1](theirs)) { guestSync = theirs; void deliverGuestSync() }
  if (!host.saveKey || !settlers[0](mine)) return null
  syncing = saveToLibrary(mine)
    .then(() => showSync('library', 'your RetroOasis save is up to date'), error => showSync('library', `couldn’t update your RetroOasis save (${error.message}); use Download my save`))
    .finally(() => { syncing = null })
  return syncing
}

function onPeer(peer, player) {
  if (session && guest) {
    // A running link keeps Console 2's cartridge; whoever holds the seat controls it.
    if (guest.nickname !== player.nickname) setStatus(`${player.nickname} is now playing your friend’s game (${guest.info.title}).`)
    guest.nickname = player.nickname
  } else guest = { nickname: player.nickname, bytes: null, save: null }
  guest.socketId = player.socketId
  guest.connected = true
  const channel = peer.pc.createDataChannel('cart', { ordered: true })
  channel.binaryType = 'arraybuffer'
  guest.channel = channel
  const receive = fileReceiver({
    limits: { rom: LINK_CAPABILITIES[system].maxRom, save: SAVE_LIMIT },
    onFile: onGuestFile,
    onError: error => message(channel, { type: 'error', text: error.message }),
    onMessage: data => {
      if (data.type === 'received' && ackWaiter?.kind === data.kind) ackWaiter.done()
      if (data.type === 'request-save') void sendGuestSave().then(result => { if (result === 'sent') setStatus(guestSaveStatus(result)) })
    },
  })
  channel.onmessage = event => { if (guest?.channel === channel) receive(event.data) }
  channel.onopen = () => {
    message(channel, { type: 'hello', system, title: host?.info.title, running: !!session, ended: sessionEnded, accept: system === 'gb' ? '.gb,.gbc,.zip' : '.gba,.zip' })
    void deliverGuestSync()
    if (!session && !sessionEnded) guestLabel.textContent = `Your friend · ${player.nickname} · adding their game…`
    refreshButtons()
  }
  channel.onclose = refreshButtons
}

function onDrop() {
  if (sessionEnded) { refreshButtons(); return }
  if (!session) { guest = null; guestLabel.textContent = 'Your friend · waiting for them to join'; placeholder(1, 'Waiting for your friend'); refreshButtons(); return }
  if (guest) guest.connected = false
  if (!paused) setPaused(true)
  setStatus('Your friend lost connection, so both games are paused. Resume once they’re back.')
  refreshButtons()
}

buttons.start.onclick = async () => {
  if (session || !host || !guest?.bytes) return
  buttons.start.disabled = true
  setStatus('Starting both games…')
  try {
    const file = setupForm.elements.save.files?.[0]
    // A chosen file wins; otherwise the game's RetroOasis save, unless the host opted out.
    let hostSave = !file && setupForm.elements.library?.checked ? host.librarySave?.bytes ?? null : null
    if (file) {
      if (file.size > SAVE_LIMIT || !validSaveSize(system, file.size)) throw new Error('Your save file does not match this system.')
      hostSave = new Uint8Array(await file.arrayBuffer())
    }
    void audioContext.resume().catch(() => {})
    const starting = guest
    session = await createLinkSession({ system, carts: [host.bytes, guest.bytes], saves: [hostSave, guest.save], loadCore, loadFile })
    if (guest !== starting) {
      // The guest left or rejoined while the cores loaded; their cartridge went with them.
      session.close(); session = null
      setStatus('Your friend lost connection while the games were starting. Start again once they’ve added their game.')
      refreshButtons()
      return
    }
    settlers = [0, 1].map(slot => saveSettler(session.exportSave(slot), session.saveRamSize(slot)))
    guestSync = null; libraryBackupPending = true; sessionBackedUp = false
    syncNotes.library = syncNotes.guest = ''; if (syncLine) syncLine.textContent = ''
    syncTimer = setInterval(syncSaves, SYNC_MS)
    images = [0, 1].map(() => new ImageData(session.width, session.height))
    paused = false; emu.paused = false; previous = null
    frame = requestAnimationFrame(tick)
    message(guest.channel, { type: 'session', running: true })
    if (narrow.matches && roomPanel) roomPanel.querySelector('details').open = false
    // On a phone, Console 1 and its touch controls fit on one screen from Console 1's top.
    if (narrow.matches) canvases[0].scrollIntoView({ block: 'start', behavior: 'smooth' })
    setStatus(session.link.warning
      ? `Playing ${host.info.title} with ${guest.info.title}. ${session.link.warning}`
      : `Connected: ${host.info.title} ↔ ${guest.info.title}. ${session.link.howTo}`)
    message(guest.channel, { type: 'status', text: session.link.warning || `Connected! ${session.link.howTo} Save in the game afterwards; your save comes to this page automatically.` })
  } catch (error) {
    clearInterval(syncTimer)
    session?.close(); session = null
    setStatus(error.message)
  }
  refreshButtons()
}
buttons.pause.onclick = () => setPaused(!paused)
buttons['my-save'].onclick = () => {
  const bytes = session?.exportSave(0)
  if (!bytes) { setStatus('This game doesn’t save.'); return }
  downloadBytes(bytes, saveName(host.name))
  setStatus('Your save was downloaded. Use it in RetroOasis (Save data on the game’s page) or your emulator to keep what you traded.')
}
function saveToLibrary(bytes) {
  // One write at a time, and only the first change of a session is backed up, so the
  // backup stays the pre-session save even when an automatic and a manual save overlap.
  const write = libraryWrites.then(async () => {
    const { backedUp, hadPrevious } = await writeLibrarySave(host.saveKey, bytes, { backup: libraryBackupPending })
    if (backedUp) sessionBackedUp = true
    // Done once the pre-session save is copied, or there was none to keep. An identical
    // pre-session save stays pending so a later change still backs it up.
    if (backedUp || !hadPrevious) libraryBackupPending = false
    return sessionBackedUp ? 'Your RetroOasis save was updated; the one from before this session is kept as a “.before-trade” copy in Saves.' : 'Your RetroOasis save was updated.'
  })
  libraryWrites = write.catch(() => {})
  return write
}
buttons['save-library'].onclick = async () => {
  const bytes = session?.exportSave(0)
  if (!bytes) { setStatus('This game doesn’t save.'); return }
  try { setStatus(await saveToLibrary(bytes) + ' Close other tabs playing this game so they don’t overwrite it.') }
  catch (error) { setStatus(`Couldn’t update your RetroOasis save (${error.message}). Use Download my save instead.`) }
}
buttons['guest-save'].onclick = () => { setStatus(`Sending ${guest.nickname} their save…`); void sendGuestSave().then(result => setStatus(guestSaveStatus(result))) }
buttons.end.onclick = async () => {
  if (!session || buttons.end.disabled) return
  buttons.end.disabled = true
  setPaused(true)
  clearInterval(syncTimer)
  await syncing // The final write below must land after any automatic one.
  const mine = session.exportSave(0), theirs = session.exportSave(1)
  let delivered = theirs ? 'Your friend got their save.' : ''
  if (theirs) setStatus(`Sending ${guest.nickname} their final save…`)
  if (theirs && await sendGuestSave(true) !== 'sent') {
    // The guest isn't connected: keep their save here so the trade isn't lost.
    downloadBytes(theirs, saveName(guest.name))
    delivered = `${guest.nickname} wasn’t connected, so their save was downloaded here as ${saveName(guest.name)}; pass it on to them.`
  }
  let saved = 'This game doesn’t save.'
  if (mine && host.saveKey) {
    try { saved = await saveToLibrary(mine) }
    catch (error) { downloadBytes(mine, saveName(host.name)); saved = `Couldn’t update your RetroOasis save (${error.message}), so it was downloaded instead.` }
  } else if (mine) { downloadBytes(mine, saveName(host.name)); saved = 'Your save was downloaded.' }
  cancelAnimationFrame(frame)
  releaseHost()
  session.close(); session = null; sessionEnded = true
  message(guest?.channel, { type: 'session', running: false })
  placeholder(0, 'Finished'); placeholder(1, 'Finished')
  setStatus(`Finished. ${saved} ${delivered}`.trim())
  refreshButtons()
}
window.addEventListener('beforeunload', event => { if (session) { event.preventDefault(); event.returnValue = '' } })
window.addEventListener('pagehide', () => { clearInterval(syncTimer); session?.close(); session = null })

async function start() {
  // Native size from the start: the guest's stream keeps the canvas size it began with.
  canvases.forEach(canvas => { canvas.width = system === 'gba' ? 240 : 160; canvas.height = system === 'gba' ? 160 : 144 })
  placeholder(0, 'Loading your game…'); placeholder(1, 'Waiting for your friend')
  if (!LINK_CAPABILITIES[system]) throw new Error('This system has no link cable support.')
  const rom = await unwrapRom(await readRomReference(params.get('rom')))
  const parsed = cartridgeInfo(system, rom.bytes)
  // The file name ("Pokemon - Crystal Version") reads better than the header ("PM_CRYSTAL").
  const info = { ...parsed, title: cartTitle(rom.name) || parsed.title }
  // The save the player itself wrote for this game (see library-saves.js).
  const { save, key } = await libraryCartSave(rom.name, system)
  host = { ...rom, info, saveKey: key, librarySave: save }
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
  setStatus('Create a room in the Trade & link panel, then send your friend the invite.')
  const { panel } = await mountHost(emu, {
    // This panel sits beside the consoles (or folds itself on phones), never over them.
    heading: 'Trade & link', onPeer, onDrop, collapseWhenReady: false, pauseButton: false,
    lede: 'Your friend joins from their own browser and plays their own game and save.',
    note: 'Keep this page open while you play.',
  })
  // In the page flow, so on narrow screens it never covers the consoles or touch controls.
  roomPanel = panel
  document.querySelector('[data-link-room]').append(panel)
  refreshButtons()
}
start().catch(error => { setStatus(error.message); placeholder(0, 'Game unavailable') })

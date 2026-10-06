import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import http from 'node:http'
import WebSocket from 'ws'
import { createLanServer, isLanAddress } from './lan-server.mjs'
import { LINK_FILES } from './lan-link.mjs'
import { inputReceiver, keyboardControl, request, createPeer, buttonHolds, roomSummary, roomCodeFrom } from '../public/lan-shared.js'
import { LAN_PROTOCOL, normalizeStick } from '../public/lan-capabilities.js'
import { coreLock, digest, inspectCore } from './lan-assets.mjs'
import './test-lan-host.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../..')
const context = { module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval, WebSocket, URL, ArrayBuffer, Uint8Array, TextEncoder, TextDecoder }
context.self = context
context.exports = context.module.exports
vm.runInNewContext(fs.readFileSync(path.join(repo, 'node_modules/socket.io/client-dist/socket.io.js'), 'utf8'), context)
const ioClient = context.module.exports
const call = (socket, event, data = {}) => new Promise((resolve, reject) => socket.timeout(2000).emit(event, { protocol: LAN_PROTOCOL, ...data }, (error, reply) => error ? reject(error) : resolve(reply)))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const waitFor = async predicate => { const deadline = Date.now() + 3000; while (!predicate()) { if (Date.now() > deadline) throw new Error('Timed out'); await delay(10) } }

assert(isLanAddress('::ffff:192.168.1.10'))
assert(isLanAddress('172.31.0.1'))
assert(isLanAddress('fd12::1'))
assert(isLanAddress('::1'))
assert(!isLanAddress('172.32.0.1'))
assert(!isLanAddress('8.8.8.8'))
assert(!isLanAddress('2001:4860:4860::8888'))
assert(!isLanAddress('192.168.invalid'))
assert(!isLanAddress('10.500.0.1'))
const keys = { KeyX: 8, ShiftLeft: 2, ShiftRight: 2, Enter: 3 }
const heldKeys = new Map()
const allowed = new Set([8, 2, 3])
const keyEvent = (code, type = 'keydown', extra = {}) => ({ code, type, target: { closest: () => null }, preventDefault() {}, ...extra })
assert(keyboardControl(keyEvent('KeyX'), keys, allowed, heldKeys))
assert(keyboardControl(keyEvent('KeyX', 'keyup', { ctrlKey: true, target: { closest: () => ({}) } }), keys, allowed, heldKeys))
assert.equal(heldKeys.size, 0, 'Key release still works after focus moves to a field or modifiers change')
assert(!keyboardControl(keyEvent('KeyX', 'keydown', { target: { closest: () => ({}) } }), keys, allowed, heldKeys), 'Typing into a field does not press a game button')
assert(!keyboardControl(keyEvent('Enter', 'keydown', { target: { closest: selector => selector === 'button' ? {} : null } }), keys, allowed, heldKeys), 'Enter activates room buttons normally')
keyboardControl(keyEvent('ShiftLeft'), keys, allowed, heldKeys)
keyboardControl(keyEvent('ShiftRight'), keys, allowed, heldKeys)
keyboardControl(keyEvent('ShiftLeft', 'keyup'), keys, allowed, heldKeys)
assert.deepEqual([...heldKeys.values()], [2], 'Releasing one Shift does not release the other')
let repeatPrevented = false
assert(!keyboardControl(keyEvent('ShiftRight', 'keydown', { repeat: true, preventDefault() { repeatPrevented = true } }), keys, allowed, heldKeys), 'Auto-repeat does not resend unchanged controls')
assert(repeatPrevented, 'Auto-repeat of a game key is still swallowed')
assert.equal(roomCodeFrom(' ab12cd34ef '), 'AB12CD34EF')
assert.equal(roomCodeFrom('https://192.168.1.5:8787/lan.html#ab12cd34ef'), 'AB12CD34EF', 'Pasted invite links keep only the room code')
assert.equal(roomCodeFrom('#AB12CD34EF'), 'AB12CD34EF')
let pressClock = 0, timerId = 0, changes = 0
const timers = new Map()
const presses = buttonHolds(() => { changes++ }, { now: () => pressClock,
  setTimer: (callback, ms) => { timers.set(++timerId, { callback, at: pressClock + ms }); return timerId }, clearTimer: id => timers.delete(id) })
const advance = ms => { pressClock += ms; for (const [id, timer] of [...timers]) if (timer.at <= pressClock) { timers.delete(id); timer.callback() } }
presses.press(1, 0); presses.release(1); presses.lostCapture(1)
assert.deepEqual(presses.values(), [0], 'A quick tap survives normal capture loss after pointerup')
advance(79); assert.deepEqual(presses.values(), [0])
advance(1); assert.deepEqual(presses.values(), [], 'Taps release after several emulation frames')
presses.press(1, 12); presses.release(1); advance(40); presses.press(1, 23); advance(40)
assert.deepEqual(presses.values(), [23], 'A reused pointer cannot be released by an old tap timer')
presses.lostCapture(1); assert.deepEqual(presses.values(), [], 'Unexpected capture loss releases immediately')
presses.press(1, 0); presses.press(2, 0); presses.cancel(1)
assert.deepEqual(presses.values(), [0], 'One pointer cannot release another pointer holding the same button')
presses.release(2); presses.clear(); const clearedChanges = changes; advance(100)
assert.deepEqual(presses.values(), []); assert.equal(changes, clearedChanges, 'Focus loss cancels all pending tap callbacks')
assert.equal(timers.size, 0)
await assert.rejects(request({ connected: false, timeout() { throw Error('Must not queue a mutation') } }, 'room:leave'), /disconnected/)
const originalPeer = globalThis.RTCPeerConnection
let sent = 0
globalThis.RTCPeerConnection = class {
  constructor(options) { assert.deepEqual(options.iceServers, []); this.localDescription = { toJSON: () => ({ type: 'answer', sdp: 'answer' }) } }
  async setRemoteDescription() { this.remoteDescription = {} }
  async addIceCandidate() {}
  async createAnswer() { return {} }
  async setLocalDescription() {}
  close() {}
}
try {
  const signalingSocket = { connected: true, emit() { sent++ } }
  const peer = createPeer(signalingSocket, 'host')
  await peer.accept({ candidate: { candidate: 'queued' } })
  signalingSocket.connected = false
  await peer.accept({ description: { type: 'offer', sdp: 'offer' } })
  assert.equal(sent, 0, 'Disconnected signaling must not be buffered for another room')
  peer.close()
  await peer.accept({ description: { type: 'offer', sdp: 'late offer' } })
  assert.equal(sent, 0, 'Closed peers ignore stale offers')
} finally { if (originalPeer) globalThis.RTCPeerConnection = originalPeer; else delete globalThis.RTCPeerConnection }
let clock = 0
const controls = []
const receiver = inputReceiver((index, value) => controls.push([index, value]), () => clock)
assert(receiver.receive(JSON.stringify({ type: 'controls', seq: 0, buttons: [8, 4], player: 0 })))
assert.deepEqual(controls, [[8, 1], [4, 1]])
assert(!receiver.receive(JSON.stringify({ type: 'controls', seq: 0, buttons: [] })), 'Discard replayed packets')
for (const raw of ['null', '{}', '[]', 'invalid', JSON.stringify({ type: 'controls', seq: 1, buttons: [24] }), JSON.stringify({ type: 'controls', seq: 1, buttons: ['8'] })]) assert(!receiver.receive(raw))
assert(receiver.receive(JSON.stringify({ type: 'controls', seq: 2, buttons: [8] })))
assert.deepEqual(controls.at(-1), [4, 0])
clock = 1300; receiver.check()
assert.deepEqual(controls.at(-1), [8, 0], 'Watchdog releases stuck inputs')
receiver.release()
assert.equal(controls.length, 4, 'Releases are idempotent')
assert.deepEqual(normalizeStick(0.1, 0.1), [0, 0], 'Stick drift is neutral')
assert(Math.hypot(...normalizeStick(1, 1)) < 1.001, 'Diagonal sticks stay inside the unit circle')
const analog = []
const n64 = inputReceiver((index, value) => analog.push([index, value]), () => clock, 'n64')
assert(!n64.receive(JSON.stringify({ type: 'controls', seq: 0, buttons: [0], stick: [1, 0] })), 'N64 needs versioned input')
const n64Packet = (seq, buttons, stick) => JSON.stringify({ type: 'controls', v: LAN_PROTOCOL, seq, buttons, stick })
assert(n64.receive(n64Packet(0, [12, 23], [0.5, -0.5])))
assert.deepEqual(analog, [[12, 1], [23, 32767], [16, 16384], [19, 16384]])
for (const packet of [n64Packet(1, [24], [0, 0]), n64Packet(1, [0], [1.1, 0]), n64Packet(1, [0], [null, 0]), n64Packet(1, [0], [0])]) assert(!n64.receive(packet), 'Invalid N64 inputs are rejected')
assert(n64.receive(n64Packet(1, [], [-1, 0])))
assert.deepEqual(analog.slice(-5), [[12, 0], [23, 0], [16, 0], [19, 0], [17, 32767]], 'Direction changes release opposite axes')
clock += 1300; n64.check()
assert.deepEqual(analog.at(-1), [17, 0], 'Watchdog clears analog input')
assert(n64.receive(n64Packet(2, [], [1, 1])))
assert.deepEqual(analog.slice(-2), [[16, 23166], [18, 23166]], 'The host clamps diagonal stick snapshots to the unit circle')
n64.release()

// Three guests can hold the same button without releasing another player's port.
const portInputs = new Map()
const remotePorts = [1, 2, 3].map(port => inputReceiver((index, value) => {
  const key = `${port}:${index}`
  if (value) portInputs.set(key, value); else portInputs.delete(key)
}, () => clock, 'n64'))
remotePorts.forEach((receiver, index) => assert(receiver.receive(n64Packet(0, [0, 12, 21], [(index + 1) / 4, -(index + 1) / 4]))))
assert.equal(portInputs.size, 15)
const otherPorts = [...portInputs].filter(([key]) => !key.startsWith('2:'))
remotePorts[1].release()
assert.deepEqual([...portInputs], otherPorts, 'Disconnect/removal releases only that guest, including C/Z and analog')
assert(remotePorts[1].receive(n64Packet(1, [1, 23], [-.5, 0])))
assert.equal(portInputs.get('2:17'), 16384)
assert.equal(portInputs.get('1:16'), 8192)
assert.equal(portInputs.get('3:16'), 23166)
clock += 1300
assert(remotePorts[0].receive(n64Packet(1, [0], [.25, 0])))
assert(remotePorts[2].receive(n64Packet(1, [0], [.75, 0])))
remotePorts.forEach(receiver => receiver.check())
assert(![...portInputs.keys()].some(key => key.startsWith('2:')), 'Only the stale guest times out')
assert(portInputs.has('1:0') && portInputs.has('3:0'), 'Other guests remain active')
remotePorts.forEach(receiver => receiver.release())
assert.equal(portInputs.size, 0, 'Room end/pause neutralizes every port')
assert.equal(roomSummary({maxPlayers:4,locked:false,players:[{connected:true}]}), '1/4 seats filled · 3 open')
assert.equal(roomSummary({maxPlayers:4,locked:true,players:[{connected:true},{connected:true},{connected:false},{connected:true}]}), '4/4 seats filled · Full · 1 reserved for reconnect · Locked')
console.log('PASS simultaneous N64 ports, independent disconnect/stale release and four-seat summaries')
assert.deepEqual(analog.slice(-2), [[16, 0], [18, 0]], 'Release clears both diagonal axes')
assert(n64.receive(n64Packet(3, [12], [0.5, 0]), false), 'Paused input is validated and its sequence is consumed')
const pausedLength = analog.length
assert(!n64.receive(n64Packet(3, [12], [0.5, 0])), 'A paused packet cannot be replayed after resume')
assert.equal(analog.length, pausedLength, 'Paused controls cannot press any buttons or axes')
assert(n64.receive(n64Packet(4, [12], [0.5, 0])), 'A fresh snapshot restores held controls after resume')
n64.release()
console.log('PASS LAN address filtering, input validation, replay protection, focus changes and stale signaling cleanup')

const fixture = fs.mkdtempSync(path.join(here, '.lan-test-cache-'))
fs.writeFileSync(path.join(fixture, 'index.html'), '<title>LAN fixture</title>')
assert.equal((await inspectCore('mupen64plus_next', fixture)).ready, false, 'Missing cores fail preflight')
const pinned = Object.keys(coreLock.files)[0]
assert.notEqual(digest(Buffer.from('invalid core')), coreLock.files[pinned].sha256)
await assert.rejects(inspectCore('../../private', fixture), /Unsupported/)
const linkFixture = path.join(fixture, 'link')
const lan = createLanServer({ port: 0, staticRoot: fixture, linkRoot: linkFixture })
lan.server.listen(0, '127.0.0.1')
await once(lan.server, 'listening')
const port = lan.server.address().port
lan.setPort(port)
const origin = `http://127.0.0.1:${port}`
const clients = []
const connect = async () => {
  const socket = ioClient(origin, { transports: ['websocket'], reconnection: false })
  clients.push(socket)
  await Promise.race([once(socket, 'connect'), once(socket, 'connect_error').then(([error]) => { throw error })])
  return socket
}

try {
  const index = await fetch(origin)
  assert.equal(index.status, 200)
  assert.equal(index.headers.get('cross-origin-embedder-policy'), 'require-corp')
  assert.equal(index.headers.get('cross-origin-opener-policy'), 'same-origin')
  assert.equal((await (await fetch(origin + '/api/lan')).json()).available, true)
  assert.equal((await fetch(origin + '/api/lan', { headers: { Origin: 'https://evil.test' } })).status, 403, 'Reject cross-origin requests')
  const badHost = await new Promise(resolve => { const req = http.get(origin + '/api/lan', { headers: { Host: `evil.test:${port}` } }, response => { response.resume(); resolve(response.statusCode) }); req.on('error', error => { throw error }) })
  assert.equal(badHost, 403, 'Reject DNS rebinding Host headers')
  assert.equal((await fetch(origin + '/%2e%2e%2fpackage.json')).status, 404, 'Encoded traversal stays outside public directories')
  assert.equal((await fetch(origin + '/api/lan', { method: 'POST' })).status, 405)
  const rejectedHandshake = once(lan.io.engine, 'connection_error')
  await assert.rejects(new Promise((resolve, reject) => {
    const socket = new WebSocket(origin.replace('http:', 'ws:') + '/socket.io/?EIO=4&transport=websocket', { origin: 'https://evil.test' })
    socket.once('open', () => { socket.close(); resolve() })
    socket.once('error', reject)
  }), /400/, 'Engine.IO rejects WebSocket upgrades with HTTP 400')
  assert.equal((await rejectedHandshake)[0].code, 4, 'Cross-origin handshakes must fail as forbidden, rather than a transport error')
  const host = await connect()
  const guest = await connect()
  const stranger = await connect()
  assert.equal((await call(host, 'room:create', { protocol: LAN_PROTOCOL - 1, title: 'Old client', core: 'n64', nickname: 'Host' })).ok, false, 'Old protocol clients cannot create rooms')
  assert.equal((await call(host, 'room:create', { title: 'Invalid capacity', core: 'nes', nickname: 'Host', maxPlayers: 4 })).ok, false)
  assert.equal((await call(host, 'room:create', { title: 'Unsupported', core: 'psp', nickname: 'Host' })).ok, false)
  for (const core of ['gb', 'gba']) assert.equal((await call(host, 'room:create', { title: 'Unbuilt link session', core, nickname: 'Host' })).ok, false, 'Handheld rooms need built link cores')
  let info = await (await fetch(origin + '/api/lan')).json()
  assert.equal(info.link.ready, false); assert(!info.cores.includes('gb'), 'Unbuilt link systems are not advertised')
  assert.equal((await fetch(origin + '/link/sameboy-link.wasm')).status, 404, 'No link files before a verified build')
  // A checksummed bundle (contents are irrelevant to the server) enables link rooms.
  fs.mkdirSync(linkFixture)
  const files = {}
  for (const name of LINK_FILES) { const bytes = Buffer.from(`fixture ${name}`); fs.writeFileSync(path.join(linkFixture, name), bytes); files[name] = { size: bytes.length, sha256: digest(bytes) } }
  fs.writeFileSync(path.join(linkFixture, 'manifest.json'), JSON.stringify({ version: 1, files }))
  fs.writeFileSync(path.join(linkFixture, 'private.txt'), 'not served')
  info = await (await fetch(origin + '/api/lan')).json()
  assert.deepEqual([info.link.ready, info.link.systems], [true, ['gb', 'gba']]); assert(info.cores.includes('gba'))
  const served = await fetch(origin + '/link/sameboy-link.wasm')
  assert.equal(served.headers.get('content-type'), 'application/wasm'); assert.equal(await served.text(), 'fixture sameboy-link.wasm')
  for (const name of ['manifest.json', 'private.txt', '..%2fprivate.txt', 'sub/gpsp-link.wasm']) assert.equal((await fetch(origin + '/link/' + name)).status, 404, `Only bundle files are served (${name})`)
  const linkRoom = await call(host, 'room:create', { title: 'Trade', core: 'gb', nickname: 'Host' })
  assert(linkRoom.ok && linkRoom.room.mode === 'linked-consoles' && linkRoom.room.maxPlayers === 2, 'Link rooms are two-player linked-console rooms')
  await call(host, 'room:leave')
  fs.writeFileSync(path.join(linkFixture, 'gpsp-link.wasm'), 'tampered')
  fs.utimesSync(path.join(linkFixture, 'manifest.json'), new Date(), new Date(Date.now() + 5000))
  assert.equal((await (await fetch(origin + '/api/lan')).json()).link.ready, false, 'A modified link core disables link rooms')
  assert.equal((await call(host, 'room:create', { title: 'Tampered', core: 'gba', nickname: 'Host' })).ok, false)
  const created = await call(host, 'room:create', { title: '<Fixture game>', core: 'nes', nickname: 'Host' })
  assert(created.ok)
  const code = created.room.code
  assert.match(code, /^[A-F0-9]{10}$/)
  assert.equal(created.room.players[0].slot, 0)
  const qr = await fetch(origin + '/api/lan/qr?invite=' + encodeURIComponent(`${origin}/lan.html#${code}`))
  assert.equal(qr.headers.get('content-type'), 'image/svg+xml')
  assert.match(await qr.text(), /<svg/)
  assert.equal((await fetch(origin + '/api/lan/qr?invite=' + encodeURIComponent('https://evil.test/lan.html#' + code))).status, 400)
  assert.equal((await call(host, 'room:create', { title: 'Second', core: 'nes', nickname: 'Host' })).ok, false)
  assert.equal((await call(guest, 'room:join', { code: 'BAD', nickname: 'Guest' })).ok, false)
  await call(host, 'room:lock', { locked: true })
  assert.equal((await call(guest, 'room:join', { code, nickname: 'Guest' })).ok, false)
  await call(host, 'room:lock', { locked: false })
  const joined = await call(guest, 'room:join', { code: code.toLowerCase(), nickname: 'Guest', slot: 0 })
  assert(joined.ok)
  assert.equal(joined.room.players.find(player => player.id === joined.playerId).slot, 1, 'Guest cannot choose host slot')
  assert(!JSON.stringify(joined.room).includes(joined.resumeToken), 'Roster never reveals reconnect secrets')
  assert.equal((await call(stranger, 'room:join', { code, nickname: 'Extra' })).ok, false, 'Room capacity is enforced')
  assert.equal((await call(guest, 'room:lock', { locked: true })).ok, false)
  assert.equal((await call(guest, 'room:kick', { id: created.playerId })).ok, false)
  const forwarded = once(guest, 'room:signal')
  host.emit('room:signal', { target: guest.id, signal: { description: { type: 'offer', sdp: 'fixture-offer', injected: true }, injected: true } })
  const routed = (await forwarded)[0]
  assert.equal(routed.sender, host.id)
  assert.deepEqual(JSON.parse(JSON.stringify(routed.signal)), { description: { type: 'offer', sdp: 'fixture-offer' } }, 'Only validated signaling fields are forwarded')
  let unexpected = 0
  guest.on('room:signal', () => unexpected++)
  stranger.emit('room:signal', { target: guest.id, signal: { description: { type: 'offer', sdp: 'spoof' } } })
  host.emit('room:signal', { target: guest.id, signal: { candidate: { candidate: 'bad', sdpMLineIndex: -1 } } })
  host.emit('room:signal', { target: guest.id, signal: { description: { type: 'offer', sdp: 'ambiguous' }, candidate: { candidate: 'ambiguous' } } })
  guest.emit('room:signal', { target: host.id, signal: { description: { type: 'offer', sdp: 'wrong-role' } } })
  await delay(40)
  assert.equal(unexpected, 0, 'Outside peers cannot inject signaling')
  const guestId = joined.playerId
  guest.disconnect()
  await waitFor(() => lan.rooms.rooms.get(code).members[1].connected === false)
  assert.equal((await call(stranger, 'room:join', { code, nickname: 'Steal slot' })).ok, false, 'Disconnected slots are reserved')
  const resumed = await connect()
  const restored = await call(resumed, 'room:join', { code, nickname: 'Guest', resumeToken: joined.resumeToken })
  assert(restored.ok)
  assert.equal(restored.playerId, guestId)
  assert.equal(restored.room.players.find(player => player.id === guestId).slot, 1)
  const kicked = once(resumed, 'room:ended')
  assert((await call(host, 'room:kick', { id: guestId })).ok)
  assert.match((await kicked)[0].reason, /removed/)
  assert.equal((await call(resumed, 'room:join', { code, nickname: 'Guest', resumeToken: joined.resumeToken })).ok, false, 'Kicked reconnect credentials are invalidated')
  const finalGuest = await call(stranger, 'room:join', { code, nickname: 'Final guest' })
  assert(finalGuest.ok)
  const ended = once(stranger, 'room:ended')
  host.disconnect()
  assert.match((await ended)[0].reason, /host left/)
  assert.equal(lan.rooms.rooms.size, 0)
  const n64Host = await connect()
  const defaultN64 = await call(n64Host, 'room:create', { title: 'Default N64', core: 'n64', nickname: 'Host' })
  assert.equal(defaultN64.room.maxPlayers, 2, 'Four-player hosting requires an explicit selection')
  const defaultGuest = await connect()
  assert((await call(defaultGuest, 'room:join', { code: defaultN64.room.code, nickname: 'Guest' })).ok)
  const deliberateEnd = once(defaultGuest, 'room:ended')
  await call(n64Host, 'room:leave')
  assert.match((await deliberateEnd)[0].reason, /host ended/, 'Guests can tell a deliberate end from a lost host')
  defaultGuest.disconnect()
  assert.equal((await call(stranger, 'room:join', { code, nickname: 'Guest' })).ok, false)
  const createdN64 = await call(n64Host, 'room:create', { title: 'N64 fixture', core: 'n64', nickname: 'Host', maxPlayers: 4 })
  assert(createdN64.ok)
  assert.equal(createdN64.room.protocol, LAN_PROTOCOL)
  assert.equal(createdN64.room.profile, 'n64')
  assert.equal((await call(stranger, 'room:join', { code: createdN64.room.code, nickname: 'Old guest', protocol: 1 })).ok, false)
  const n64Guests = await Promise.all([connect(), connect(), connect()])
  const n64Joins = await Promise.all(n64Guests.map((socket, index) => call(socket, 'room:join', { code: createdN64.room.code, nickname: `Player ${index + 2}`, slot: 0 })))
  const portOf = join => join.room.players.find(player => player.id === join.playerId).slot
  assert.deepEqual(n64Joins.map(join => join.room.players.find(player => player.id === join.playerId).slot).sort(), [1, 2, 3], 'Simultaneous N64 joins have independent server-owned ports')
  assert.equal((await call(stranger, 'room:join', { code: createdN64.room.code, nickname: 'Fifth player' })).ok, false)
  let guestSignal = 0
  n64Guests[1].on('room:signal', () => guestSignal++)
  n64Guests[0].emit('room:signal', { target: n64Guests[1].id, signal: { description: {type:'answer',sdp:'guest-to-guest'} } })
  await delay(40)
  assert.equal(guestSignal, 0, 'Guests cannot signal to other guests')
  n64Guests[1].disconnect()
  await waitFor(() => lan.rooms.rooms.get(createdN64.room.code).members.find(member => member.slot === portOf(n64Joins[1]))?.connected === false)
  assert.equal((await call(stranger, 'room:join', { code: createdN64.room.code, nickname: 'Steal third port' })).ok, false)
  const n64Resumed = await connect()
  const n64Restored = await call(n64Resumed, 'room:join', { code: createdN64.room.code, nickname: 'Restored', resumeToken: n64Joins[1].resumeToken })
  assert.equal(n64Restored.room.players.find(player => player.id === n64Restored.playerId).slot, portOf(n64Joins[1]))
  await call(n64Host, 'room:kick', {id:n64Joins[0].playerId})
  const replacement = await call(stranger, 'room:join', { code: createdN64.room.code, nickname: 'Replacement' })
  assert.equal(replacement.room.players.find(player => player.id === replacement.playerId).slot, portOf(n64Joins[0]), 'Removing one player frees only their port')
  assert.equal(lan.rooms.rooms.get(createdN64.room.code).members.find(member => member.slot === portOf(n64Joins[2])).socketId, n64Guests[2].id, 'Other players stay connected')
  await call(n64Host, 'room:leave')
  assert.equal(lan.rooms.rooms.size, 0)
  console.log('PASS N64 four-player slots, capacity, protocol mismatch, per-player reconnects and signaling isolation')
  console.log('PASS real LAN server: HTTP isolation, QR invites, ownership, capacity, signaling, reconnects, removal and host exit')
} finally {
  clients.forEach(socket => socket.disconnect())
  lan.rooms.close()
  await new Promise(resolve => lan.io.close(resolve))
  await delay(100)
  if (!fixture.startsWith(here + path.sep)) throw new Error('Test directory outside workspace')
  fs.rmSync(fixture, { recursive: true, force: true })
}

if (process.argv.includes('--browser')) {
  const browserFixture = fs.mkdtempSync(path.join(here, '.lan-test-cache-'))
  for (const name of ['lan.html', 'lan.css', 'lan-guest.js', 'lan-host.js', 'lan-shared.js', 'lan-capabilities.js', 'controller-input.js']) fs.copyFileSync(path.join(repo, 'retrooasis/public', name), path.join(browserFixture, name))
  if (process.argv.includes('--controller')) {
    fs.copyFileSync(path.join(here, 'settings-controller-fixture.js'), path.join(browserFixture, 'settings-controller-fixture.js'))
    const guestPath = path.join(browserFixture, 'lan.html')
    fs.writeFileSync(guestPath, fs.readFileSync(guestPath, 'utf8').replace('</body>', '<script src="./settings-controller-fixture.js"></script></body>'))
  }
  fs.writeFileSync(path.join(browserFixture, 'index.html'), `<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LAN host browser fixture</title><link rel="stylesheet" href="./lan.css"><body class="ro-lan-page"><main class="ro-lan-main"><h1>LAN streaming fixture</h1><p>Generated video and audio. Each guest has a separate controller port and square; the log records held inputs independently.</p><button id="start">Start fixture game</button><canvas id="canvas" width="256" height="240" style="width:512px;max-width:100%;image-rendering:pixelated"></canvas><pre id="inputs" style="white-space:pre-wrap;overflow-wrap:anywhere">No guest input yet.</pre></main><script type="module">
    import {mountHost} from './lan-host.js';
    const canvas=document.querySelector('#canvas'), ctx=canvas.getContext('2d'), inputs=document.querySelector('#inputs');
    const core=new URLSearchParams(location.search).get('core')==='n64'?'n64':'nes';
    const held=new Map(), history=[], positions=[[0,0],[50,70],[110,130],[170,190]];
    let ready=false, emu;
    function draw(){ctx.fillStyle='#071018';ctx.fillRect(0,0,256,240);ctx.font='12px monospace';ctx.fillStyle='white';ctx.fillText('RetroOasis LAN fixture',12,28);for(let port=1;port<=(core==='n64'?3:1);port++){const has=index=>held.has(port+':'+index);const [x,y]=positions[port];if(!emu.paused){positions[port]=[Math.max(0,Math.min(225,x+(has(7)?2:0)-(has(6)?2:0)+(held.get(port+':16')||0)/16384-(held.get(port+':17')||0)/16384)),Math.max(45,Math.min(210,y+(has(5)?2:0)-(has(4)?2:0)+(held.get(port+':18')||0)/16384-(held.get(port+':19')||0)/16384))]}ctx.fillStyle=has(core==='n64'?0:8)?'#f0b429':['','#2ee6d6','#ae8fff','#ff91b7'][port];ctx.fillRect(x,y,24,24);ctx.fillText('P'+(port+1),x,y-5)}if(ready)requestAnimationFrame(draw)}
    document.querySelector('#start').onclick=async()=>{if(ready)return;ready=true;const audioContext=new AudioContext(),audioNode=audioContext.createGain(),oscillator=audioContext.createOscillator();audioNode.gain.value=.02;oscillator.connect(audioNode);audioNode.connect(audioContext.destination);oscillator.start();await audioContext.resume();emu={canvas,paused:false,config:{gameName:'LAN fixture'},getCore:()=> core,gameManager:{audioContext,audioNode,functions:{simulateInput:(player,index,value)=>{if(player<1||player>(core==='n64'?3:1))throw Error('Wrong controller slot');const key=player+':'+index;if(value)held.set(key,value);else held.delete(key);history.push([player,index,value]);if(history.length>256)history.shift();inputs.textContent=JSON.stringify({held:[...held],history:history.slice(-96)})}},simulateInput:()=>{}},on:()=>{},pause(){this.paused=true},play(){this.paused=false}};draw();await mountHost(emu);document.querySelector('#start').disabled=true;};
  </script></body></html>`)
  const browserLan = createLanServer({ port: 0, staticRoot: browserFixture })
  browserLan.server.listen(0, '0.0.0.0', () => {
    browserLan.setPort(browserLan.server.address().port)
    console.log(`LAN host browser fixture: http://127.0.0.1:${browserLan.server.address().port}/`)
    console.log('Start the fixture, create a room, then open /lan.html#<room code> in a second browser tab.')
  })
  const cleanup = () => {
    browserLan.rooms.close(); browserLan.io.close()
    if (!browserFixture.startsWith(here + path.sep)) throw new Error('Test cleanup outside workspace')
    fs.rmSync(browserFixture, { recursive: true, force: true })
  }
  process.once('SIGINT', cleanup); process.once('SIGTERM', cleanup)
}

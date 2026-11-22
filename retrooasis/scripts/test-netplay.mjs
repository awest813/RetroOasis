#!/usr/bin/env node
// EmulatorJS Netplay server in the host app: both client protocols, limits, and coexistence
// with RetroOasis rooms on the same HTTP server.   node retrooasis/scripts/test-netplay.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'
import { createLanServer } from './lan-server.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../..')
const context = { module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval, WebSocket, URL, ArrayBuffer, Uint8Array, TextEncoder, TextDecoder }
context.self = context
context.exports = context.module.exports
vm.runInNewContext(fs.readFileSync(path.join(repo, 'node_modules/socket.io/client-dist/socket.io.js'), 'utf8'), context)
const io = context.module.exports
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const fixture = fs.mkdtempSync(path.join(here, '.netplay-test-cache-'))
fs.writeFileSync(path.join(fixture, 'index.html'), '<title>fixture</title>')
const lan = createLanServer({ port: 0, staticRoot: fixture, linkRoot: path.join(fixture, 'link') })
lan.server.listen(0, '127.0.0.1')
await once(lan.server, 'listening')
lan.setPort(lan.server.address().port)
const origin = `http://127.0.0.1:${lan.server.address().port}`
const clients = []
const connect = async (url = `${origin}/netplay`, options = { path: '/netplay-io/' }) => {
  const socket = io(url, { transports: ['websocket'], reconnection: false, ...options })
  clients.push(socket)
  await Promise.race([once(socket, 'connect'), once(socket, 'connect_error').then(([error]) => { throw error })])
  return socket
}
const ask = (socket, event, data) => new Promise(resolve => socket.emit(event, data, (...reply) => resolve(reply)))
const extra = (userid, sessionid, more = {}) => ({ domain: 'x', game_id: 1234, room_name: 'Couch', player_name: userid, userid, sessionid, ...more })
const list = async gameId => (await fetch(`${origin}/netplay/list?domain=x&game_id=${gameId}`)).json()

try {
  const host = await connect()
  const updates = []
  host.on('users-updated', users => updates.push(users))
  assert.deepEqual(await ask(host, 'open-room', { extra: extra('hostA', 'room1'), maxPlayers: 2, password: '' }), [null], 'Host opens a room')
  assert.deepEqual(await list(1234), { room1: { room_name: 'Couch', current: 1, max: 2, hasPassword: false } }, 'The room is listed for its game')
  assert.deepEqual(await list(999), {}, 'Other games don’t see it')

  const guest = await connect()
  assert.equal((await ask(guest, 'join-room', { extra: extra('guestB', 'room1', { game_id: 999 }) }))[0], 'That room is playing a different game.')
  const [error, users] = await ask(guest, 'join-room', { extra: extra('guestB', 'room1') })
  assert.equal(error, null, 'Guest joins')
  assert.deepEqual(Object.keys(users).sort(), ['guestB', 'hostA'])
  assert.equal(users.hostA.socketId, host.id, 'Users carry their socket id for WebRTC')
  await delay(50)
  assert.deepEqual(Object.keys(updates.at(-1)).sort(), ['guestB', 'hostA'], 'The host hears about the guest')

  // Stable protocol: data messages, including a multi-megabyte save state.
  const got = once(guest, 'data-message')
  const state = new Uint8Array(4 * 1024 * 1024).fill(7)
  host.emit('data-message', { state })
  const [message] = await got
  assert.equal(new Uint8Array(message.state).length, state.length, 'A 4 MB save state reaches the guest')

  // Nightly protocol: WebRTC signalling only to someone in the same room.
  const signal = once(guest, 'webrtc-signal')
  host.emit('webrtc-signal', { target: guest.id, offer: { type: 'offer', sdp: 'v=0' } })
  const [relayed] = await signal
  assert.equal(relayed.sender, host.id, 'Signals are stamped with the sender')
  const stranger = await connect()
  let leaked = false
  stranger.on('webrtc-signal', () => { leaked = true })
  host.emit('webrtc-signal', { target: stranger.id, offer: { type: 'offer', sdp: 'v=0' } })
  await delay(100)
  assert.equal(leaked, false, 'Signals never reach sockets outside the room')

  assert.equal((await ask(stranger, 'join-room', { extra: extra('thirdC', 'room1') }))[0], 'That room is full.')
  const locked = await connect()
  await ask(locked, 'open-room', { extra: extra('hostD', 'room2'), maxPlayers: 4, password: 'pw' })
  assert.equal((await list(1234)).room2.hasPassword, true)
  assert.equal((await ask(stranger, 'join-room', { extra: extra('thirdC', 'room2'), password: 'no' }))[0], 'Wrong password.')
  assert.equal((await ask(stranger, 'join-room', { extra: extra('thirdC', 'room2'), password: 'pw' }))[0], null, 'The right password joins')
  assert.equal((await ask(stranger, 'open-room', { extra: extra('x', '../bad') }))[0], 'You are already in a room.')
  const bad = await connect()
  assert.equal((await ask(bad, 'open-room', { extra: extra('x', '../bad') }))[0], 'That room request isn’t valid.')

  // The host leaving closes the room.
  const emptied = once(guest, 'users-updated')
  host.emit('leave-room')
  assert.equal(Object.keys((await emptied)[0]).length, 0, 'Guests see the room empty when the host leaves')
  assert.equal((await list(1234)).room1, undefined, 'The room is gone from the list')

  // RetroOasis rooms still work on the same server (different socket.io path), and stay small.
  const roomsSocket = await connect(origin, {})
  assert.ok(roomsSocket.connected, 'Rooms socket.io still connects alongside netplay')
  await delay(1500)
  assert.ok(roomsSocket.connected && guest.connected, 'Neither server closes the other’s WebSockets')
  console.log('PASS EmulatorJS netplay server: rooms list, join rules, 4 MB states, signalling isolation, host exit, coexists with rooms')
} finally {
  for (const socket of clients) socket.close()
  lan.netplay.close(); lan.rooms.close(); lan.io.close(); lan.server.close()
  if (!fixture.startsWith(here + path.sep)) throw new Error('Test cleanup outside workspace')
  fs.rmSync(fixture, { recursive: true, force: true })
}

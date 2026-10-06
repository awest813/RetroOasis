import { randomBytes, timingSafeEqual } from 'node:crypto'

import { LAN_CORES, LAN_CAPABILITIES, LAN_PROTOCOL } from '../public/lan-capabilities.js'
export { LAN_CORES }
const token = () => randomBytes(24).toString('base64url')
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const text = (value, max) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, max) : ''

/** In-memory LAN rooms. Socket IDs and controller slots are assigned by the server. */
export function attachRooms(io, { graceMs = 15000, maxRooms = 32 } = {}) {
  const rooms = new Map()
  const roomFor = socket => rooms.get(socket.data.room)
  const memberFor = (room, socket) => room?.members.find(member => member.socketId === socket.id)
  const snapshot = room => ({ code: room.code, title: room.title, core: room.core, profile: room.core, protocol: LAN_PROTOCOL, locked: room.locked, maxPlayers: room.maxPlayers,
    players: room.members.map(({ id, socketId, nickname, slot, connected }) => ({ id, socketId, nickname, slot, connected })) })
  const publish = room => io.to(room.code).emit('room:update', snapshot(room))
  const remove = (room, member) => {
    clearTimeout(member.timer)
    room.members = room.members.filter(value => value !== member)
  }
  const close = (room, reason = 'The host ended the room.') => {
    if (!rooms.delete(room.code)) return
    for (const member of room.members) clearTimeout(member.timer)
    io.to(room.code).emit('room:ended', { reason })
    for (const member of room.members) {
      const socket = io.sockets.sockets.get(member.socketId)
      if (socket) { socket.leave(room.code); delete socket.data.room }
    }
  }
  const leave = (socket, deliberate) => {
    const room = roomFor(socket)
    const member = memberFor(room, socket)
    delete socket.data.room
    if (!member) return
    socket.leave(room.code)
    if (member.slot === 0) { close(room, deliberate ? 'The host ended the room.' : 'The host left the room.'); return }
    if (deliberate) remove(room, member)
    else {
      member.connected = false
      member.socketId = null
      member.timer = setTimeout(() => { remove(room, member); publish(room) }, graceMs)
      member.timer.unref?.()
    }
    publish(room)
  }
  io.on('connection', socket => {
    let count = 0
    let windowStart = Date.now()
    socket.use((packet, next) => {
      if (Date.now() - windowStart > 10000) { windowStart = Date.now(); count = 0 }
      if (++count > 150) { socket.disconnect(true); return }
      next()
    })
    const handle = (event, action) => socket.on(event, (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}
      try { reply({ ok: true, ...action(data && typeof data === 'object' ? data : {}) }) }
      catch (error) { reply({ ok: false, error: error.message }) }
    })
    handle('room:create', data => {
      if (data.protocol !== LAN_PROTOCOL) throw new Error('Update the host app and reload. The multiplayer versions differ.')
      if (roomFor(socket)) throw new Error('Leave your current room first.')
      if (rooms.size >= maxRooms) throw new Error('This LAN server has too many rooms. Try again later.')
      if (!LAN_CORES.has(data.core)) throw new Error('This system does not have a supported LAN multiplayer mode.')
      const capacity = LAN_CAPABILITIES[data.core].maxPlayers
      if (data.maxPlayers !== undefined && ![2, capacity].includes(data.maxPlayers)) throw new Error('Invalid player capacity.')
      const title = text(data.title, 100)
      const nickname = text(data.nickname, 32)
      if (!title || !nickname) throw new Error('Enter a game title and player name.')
      let code
      do { code = randomBytes(5).toString('hex').toUpperCase() } while (rooms.has(code))
      const room = { code, title, core: data.core, maxPlayers: data.maxPlayers ?? 2, locked: false, members: [{ id: token(), socketId: socket.id, nickname, slot: 0, connected: true }] }
      rooms.set(code, room)
      socket.data.room = code
      socket.join(code)
      return { room: snapshot(room), playerId: room.members[0].id }
    })
    handle('room:join', data => {
      if (data.protocol !== LAN_PROTOCOL) throw new Error('Update the app and reload. The multiplayer versions differ.')
      if (roomFor(socket)) throw new Error('Leave your current room first.')
      const room = rooms.get(typeof data.code === 'string' ? data.code.toUpperCase() : '')
      if (!room) throw new Error('Room not found. Ask the host for a new invite.')
      let member = room.members.find(member => member.slot > 0 && equal(member.resumeToken, data.resumeToken))
      if (data.resumeToken && !member) throw new Error('Your reconnect reservation expired. Join again.')
      if (member?.connected) throw new Error('That player is already connected.')
      if (!member) {
        if (room.locked) throw new Error('The host locked this room.')
        if (room.members.length >= room.maxPlayers) throw new Error('This room is full.')
        const nickname = text(data.nickname, 32)
        if (!nickname) throw new Error('Enter your player name.')
        const slot = Array.from({ length: room.maxPlayers - 1 }, (_, i) => i + 1).find(slot => !room.members.some(member => member.slot === slot))
        member = { id: token(), resumeToken: token(), nickname, slot }
        room.members.push(member)
      }
      clearTimeout(member.timer)
      member.socketId = socket.id
      member.connected = true
      socket.data.room = room.code
      socket.join(room.code)
      // Queue the roster until the join acknowledgement reaches the guest.
      setTimeout(() => { if (rooms.has(room.code)) publish(room) }, 0)
      return { room: snapshot(room), playerId: member.id, resumeToken: member.resumeToken }
    })
    handle('room:lock', data => {
      const room = roomFor(socket)
      if (memberFor(room, socket)?.slot !== 0) throw new Error('Only the host can lock this room.')
      if (typeof data.locked !== 'boolean') throw new Error('Invalid room setting.')
      room.locked = data.locked
      publish(room)
      return {}
    })
    handle('room:kick', data => {
      const room = roomFor(socket)
      if (memberFor(room, socket)?.slot !== 0) throw new Error('Only the host can remove players.')
      const member = room.members.find(member => member.id === data.id && member.slot > 0)
      if (!member) throw new Error('Player not found.')
      const guest = io.sockets.sockets.get(member.socketId)
      if (guest) { guest.emit('room:ended', { reason: 'The host removed you from the room.' }); guest.leave(room.code); delete guest.data.room }
      remove(room, member)
      publish(room)
      return {}
    })
    handle('room:leave', () => { leave(socket, true); return {} })
    socket.on('room:signal', data => {
      const room = roomFor(socket)
      const sender = memberFor(room, socket)
      const recipient = room?.members.find(member => member.connected && member.socketId === data?.target)
      if (!sender || !recipient || sender === recipient || (sender.slot !== 0 && recipient.slot !== 0)) return
      const signal = data.signal
      if (!signal || typeof signal !== 'object') return
      let validated
      if (signal.description && !signal.candidate) {
        const { type, sdp } = signal.description
        if (type === (sender.slot === 0 ? 'offer' : 'answer') && typeof sdp === 'string' && sdp.length > 0 && sdp.length < 12000) validated = { description: { type, sdp } }
      } else if (signal.candidate && !signal.description) {
        const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = signal.candidate
        if (typeof candidate === 'string' && candidate.length < 2048
          && (sdpMid == null || (typeof sdpMid === 'string' && sdpMid.length <= 100))
          && (sdpMLineIndex == null || (Number.isInteger(sdpMLineIndex) && sdpMLineIndex >= 0 && sdpMLineIndex <= 64))
          && (usernameFragment == null || (typeof usernameFragment === 'string' && usernameFragment.length <= 256))) {
          validated = { candidate: { candidate, sdpMid, sdpMLineIndex, usernameFragment } }
        }
      }
      if (validated) io.to(recipient.socketId).emit('room:signal', { sender: socket.id, signal: validated })
    })
    socket.on('disconnect', () => leave(socket, false))
  })
  return { rooms, close: () => { for (const room of rooms.values()) close(room, 'The LAN server stopped.') } }
}

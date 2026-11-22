// EmulatorJS's own Netplay, served by the RetroOasis host app instead of a public server.
// Speaks the protocol of both EmulatorJS netplay clients:
//   Stable: open-room / join-room / data-message / users-updated (both players run the game;
//           inputs and save states travel as data-message, so messages can be several MB).
//   Nightly and the bundled build: the same, plus leave-room and webrtc-signal (the host
//           streams the game to guests over WebRTC; this server only relays the signalling).
// It runs on its own socket.io endpoint (/netplay-io/) so its large message limit never
// applies to RetroOasis rooms, which keep their small one.
import { timingSafeEqual } from 'node:crypto'
import { Server } from 'socket.io'
import { cleanText } from './lan-rooms.mjs'

export const NETPLAY_PATH = '/netplay-io/'
export const NETPLAY_NAMESPACE = '/netplay'
const MAX_MESSAGE = 32 * 1024 * 1024
const MAX_ROOMS = 32
const MAX_PLAYERS = 4
const ROOMS_PER_ADDRESS = 4
// Save states are large but rare; inputs are small and frequent. Over this, a client is dropped.
const BYTES_PER_10S = 96 * 1024 * 1024
const ID = /^[A-Za-z0-9_-]{1,64}$/

const samePassword = (a, b) => {
  const left = Buffer.from(String(a ?? '')), right = Buffer.from(String(b ?? ''))
  return left.length === right.length && timingSafeEqual(left, right)
}

/** A client's `extra`, kept to the fields the clients read, with ids and text checked. */
function cleanExtra(extra) {
  if (!extra || typeof extra !== 'object') return null
  const { userid, sessionid } = extra
  if (!ID.test(String(userid)) || !ID.test(String(sessionid))) return null
  const gameId = Number(extra.game_id)
  if (!Number.isSafeInteger(gameId)) return null
  return {
    domain: cleanText(extra.domain, 255),
    game_id: gameId,
    room_name: cleanText(extra.room_name, 60) || 'Room',
    player_name: cleanText(extra.player_name, 32) || 'Player',
    userid: String(userid),
    sessionid: String(sessionid),
  }
}

/** attachNetplay(server, { allowRequest }) → { io, rooms, list(params), close() } */
export function attachNetplay(server, { allowRequest }) {
  const io = new Server(server, {
    path: NETPLAY_PATH, serveClient: false, transports: ['websocket'], maxHttpBufferSize: MAX_MESSAGE,
    allowRequest, cors: { origin: false },
  })
  const nsp = io.of(NETPLAY_NAMESPACE)
  const rooms = new Map() // sessionid → { owner, password, max, extra, users: Map userid → { ...extra, socketId } }
  const usersOf = room => Object.fromEntries([...room.users].map(([id, user]) => [id, user]))
  const publish = room => nsp.to(room.extra.sessionid).emit('users-updated', usersOf(room))

  const leave = socket => {
    const room = rooms.get(socket.data.session)
    const userid = socket.data.userid
    delete socket.data.session; delete socket.data.userid
    if (!room) return
    socket.leave(room.extra.sessionid)
    room.users.delete(userid)
    if (room.owner === socket.id || room.users.size === 0) {
      // The host left: the room is gone; anyone still in it sees an empty list and leaves.
      rooms.delete(room.extra.sessionid)
      nsp.to(room.extra.sessionid).emit('users-updated', {})
      for (const user of room.users.values()) {
        const member = nsp.sockets.get(user.socketId)
        if (!member) continue
        // Free them to open or join another room, and keep them out of a reused session id.
        delete member.data.session; delete member.data.userid
        member.leave(room.extra.sessionid)
      }
      return
    }
    publish(room)
  }

  const address = socket => socket.handshake.address || ''
  nsp.on('connection', socket => {
    let bytes = 0, bytesStart = Date.now()
    socket.conn.on('packet', packet => {
      if (Date.now() - bytesStart > 10000) { bytesStart = Date.now(); bytes = 0 }
      const size = typeof packet.data === 'string' ? packet.data.length : packet.data?.byteLength ?? 0
      bytes += size
      // Large payloads only make sense inside a room (save states); anything else is dropped.
      if (bytes > BYTES_PER_10S || (size > 65536 && !socket.data.session)) socket.disconnect(true)
    })
    let count = 0, windowStart = Date.now()
    socket.use((packet, next) => {
      // Inputs run every frame; this only stops a runaway client.
      if (Date.now() - windowStart > 1000) { windowStart = Date.now(); count = 0 }
      if (++count > 600) { socket.disconnect(true); return }
      next()
    })
    const reply = (cb, ...args) => { if (typeof cb === 'function') cb(...args) }

    socket.on('open-room', (data, cb) => {
      if (socket.data.session) return reply(cb, 'You are already in a room.')
      const extra = cleanExtra(data?.extra)
      if (!extra) return reply(cb, 'That room request isn’t valid.')
      if (rooms.has(extra.sessionid)) return reply(cb, 'That room already exists.')
      if (rooms.size >= MAX_ROOMS) return reply(cb, 'This host app has too many rooms open. Try again later.')
      const mine = [...rooms.values()].filter(room => room.address === address(socket)).length
      if (mine >= ROOMS_PER_ADDRESS) return reply(cb, 'This device already has several rooms open. Close one first.')
      const max = Math.min(MAX_PLAYERS, Math.max(2, Number.parseInt(data?.maxPlayers, 10) || 2))
      const password = typeof data?.password === 'string' ? data.password.slice(0, 64) : ''
      const room = { owner: socket.id, address: address(socket), password, max, extra, users: new Map([[extra.userid, { ...extra, socketId: socket.id }]]) }
      rooms.set(extra.sessionid, room)
      socket.data.session = extra.sessionid; socket.data.userid = extra.userid
      socket.join(extra.sessionid)
      reply(cb, null)
      publish(room)
    })

    socket.on('join-room', (data, cb) => {
      if (socket.data.session) return reply(cb, 'You are already in a room.')
      const extra = cleanExtra(data?.extra)
      const room = extra && rooms.get(extra.sessionid)
      if (!room) return reply(cb, 'That room has closed.')
      if (room.extra.game_id !== extra.game_id) return reply(cb, 'That room is playing a different game.')
      if (room.password && !samePassword(room.password, data?.password)) return reply(cb, 'Wrong password.')
      if (room.users.size >= room.max) return reply(cb, 'That room is full.')
      if (room.users.has(extra.userid)) return reply(cb, 'That player is already in the room.')
      room.users.set(extra.userid, { ...extra, room_name: room.extra.room_name, socketId: socket.id })
      socket.data.session = extra.sessionid; socket.data.userid = extra.userid
      socket.join(extra.sessionid)
      reply(cb, null, usersOf(room))
      publish(room)
    })

    socket.on('data-message', data => {
      const session = socket.data.session
      if (session && rooms.has(session) && socket.rooms.has(session)) socket.to(session).emit('data-message', data)
    })

    socket.on('webrtc-signal', data => {
      const room = rooms.get(socket.data.session)
      const target = typeof data?.target === 'string' ? data.target : ''
      // Only to someone in the same room.
      if (!room || ![...room.users.values()].some(user => user.socketId === target)) return
      nsp.to(target).emit('webrtc-signal', { ...data, sender: socket.id })
    })

    socket.on('leave-room', () => leave(socket))
    socket.on('disconnect', () => leave(socket))
  })

  return {
    io,
    rooms,
    /** GET /netplay/list?domain=…&game_id=… → open rooms for that game. */
    list(params) {
      const gameId = Number(params.get('game_id'))
      const out = {}
      for (const [id, room] of rooms) {
        if (room.extra.game_id !== gameId) continue
        out[id] = { room_name: room.extra.room_name, current: room.users.size, max: room.max, hasPassword: !!room.password }
      }
      return out
    },
    close() { io.close() },
  }
}

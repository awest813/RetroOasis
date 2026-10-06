import { connectSocket, createPeer, lanInfo, request, roster, roomSummary, inputReceiver, status, savedNickname, saveNickname } from './lan-shared.js'
import { LAN_CAPABILITIES, inputIndices } from './lan-capabilities.js'

/** Installed before the loader starts. Local emulation stays Player 1 throughout. */
export function installLanHost() {
  const previous = window.EJS_onGameStart
  window.EJS_onGameStart = (...args) => {
    previous?.(...args)
    void mountHost(window.EJS_emulator)
  }
}

export async function mountHost(emu) {
  const core = emu.getCore(true)
  const profile = LAN_CAPABILITIES[core]
  if (!profile) throw new Error('This system has no LAN multiplayer adapter.')
  const panel = document.createElement('aside')
  panel.className = 'ro-lan-panel'
  panel.setAttribute('aria-label', 'LAN multiplayer room')
  panel.innerHTML = `<details open><summary>LAN multiplayer</summary>
    <form data-lan-create><label>Your name <input name="nickname" maxlength="32" autocomplete="nickname" required></label>
    ${profile.maxPlayers > 2 ? '<label>Room size <select name="maxPlayers" aria-describedby="lan-capacity-help"><option value="2">2 players · host + 1 guest</option><option value="4">4 players · host + 3 guests (experimental)</option></select></label><p id="lan-capacity-help">Choose four players before creating the room. The game must support four controllers; select its multiplayer mode after everyone joins.</p>' : ''}
    <button type="submit" disabled>Create room</button></form>
    <div data-lan-room hidden><p data-lan-capacity role="status" aria-live="polite" aria-atomic="true"></p><ul data-lan-players aria-label="Controller seats"></ul>
    <details><summary>Invite players</summary><label>Invite a player on the same Wi-Fi <select data-lan-address aria-label="Invite address"></select><input data-lan-invite readonly aria-label="Room invite link"></label>
    <img class="ro-lan-qr" data-lan-qr alt="Scan to join this room on the same Wi-Fi"></details>
    <div class="ro-lan-actions"><button type="button" data-lan-copy>Copy invite</button><button type="button" data-lan-lock aria-pressed="false">Lock room</button><button type="button" data-lan-pause>Pause game</button><button type="button" data-lan-end>End room</button></div>
    <p>Keep this game and the LAN server open. You are Player 1; each guest owns one controller. Everyone shares the same game screen.</p></div>
    <p data-lan-status role="status" aria-live="polite">Preparing room service…</p><button type="button" data-lan-retry hidden>Retry connection</button></details>`
  document.body.append(panel)
  const stylesheet = document.createElement('link')
  stylesheet.rel = 'stylesheet'; stylesheet.href = './lan.css'; document.head.append(stylesheet)
  let socket, room, stream
  let busy = false
  let ending = false
  let stopped = false
  let generation = 0
  let audioDestination, audioNodes = []
  const peers = new Map()
  const refreshRoster = () => {
    if (!room) return
    const capacity = panel.querySelector('[data-lan-capacity]')
    const summary = roomSummary(room)
    if (capacity.textContent !== summary) capacity.textContent = summary
    const connections = new Map([...peers].map(([id, peer]) => {
      const ready = peer.pc.connectionState === 'connected' && peer.channel?.readyState === 'open'
      if (ready) { clearTimeout(peer.deadline); peer.timedOut = false }
      return [id, ready ? 'Ready to play' : peer.timedOut ? 'Timed out · reconnect'
        : ['disconnected', 'failed', 'closed'].includes(peer.pc.connectionState) || ['closed', 'closing'].includes(peer.channel?.readyState) ? 'Game connection lost · reconnect' : 'Connecting to game…']
    }))
    roster(panel.querySelector('[data-lan-players]'), room, id => { void request(socket, 'room:kick', { id }).catch(error => status(error.message, panel)) }, connections)
  }
  const originalInput = emu.gameManager?.simulateInput
  if (originalInput) emu.gameManager.simulateInput = function (player, ...args) {
    if (room && player !== 0) return // Additional controller ports belong to guests.
    return originalInput.call(this, player, ...args)
  }
  const form = panel.querySelector('form')
  form.elements.nickname.value = savedNickname('Host')
  const roomBox = panel.querySelector('[data-lan-room]')
  const address = panel.querySelector('[data-lan-address]')
  const invite = panel.querySelector('[data-lan-invite]')
  const createButton = form.querySelector('button')
  const lock = panel.querySelector('[data-lan-lock]')
  const retry = panel.querySelector('[data-lan-retry]')
  let retryFocus = false
  const serviceReady = () => {
    retry.hidden = true
    if (!room) {
      createButton.disabled = false
      if (retryFocus && (document.activeElement === document.body || document.activeElement === retry)) createButton.focus({ preventScroll: true })
      status('Room service ready. Create a room when you’re ready.', panel)
    }
    retryFocus = false
  }
  const drop = id => {
    const peer = peers.get(id)
    if (!peer) return
    clearTimeout(peer.deadline)
    peer.receiver.release()
    peer.close()
    peers.delete(id)
  }
  const stopStream = () => {
    stream?.getTracks().forEach(track => track.stop()); stream = null
    for (const node of audioNodes) { try { node.disconnect(audioDestination) } catch { /* already disconnected */ } }
    audioDestination?.stream.getTracks().forEach(track => track.stop())
    audioNodes = []; audioDestination = null
  }
  const endLocal = message => {
    generation++
    busy = false
    ending = false
    room = null
    for (const id of peers.keys()) drop(id)
    stopStream()
    roomBox.hidden = true; form.hidden = false; createButton.disabled = !socket?.connected
    if (panel.contains(document.activeElement) && document.activeElement.closest('[data-lan-room]')) form.elements.nickname.focus({ preventScroll: true })
    status(message, panel)
  }
  function capture() {
    if (!emu.canvas?.captureStream || !emu.gameManager?.functions?.simulateInput) throw new Error('This emulator cannot stream multiplayer yet.')
    const captured = emu.canvas.captureStream(30)
    if (!captured.getVideoTracks().length) throw new Error('The game’s video is not ready. Try again.')
    try {
      const manager = emu.gameManager
      const ctx = manager.audioContext || emu.Module?.AL?.currentCtx?.audioCtx
      if (ctx) {
        void ctx.resume().catch(() => status('The browser paused game audio. Resume the game to enable sound.', panel))
        audioDestination = ctx.createMediaStreamDestination()
        const al = emu.Module?.AL?.currentCtx
        audioNodes = manager.audioNode ? [manager.audioNode] : al?.gain ? [al.gain] : Object.values(al?.sources || {}).map(source => source.gain).filter(Boolean)
        for (const node of audioNodes) node.connect(audioDestination)
        if (audioNodes.length) audioDestination.stream.getAudioTracks().forEach(track => captured.addTrack(track))
      }
    } catch { status('Video is ready; this core’s audio capture is unavailable.', panel) }
    return captured
  }
  function update(next) {
    if (!room || next.code !== room.code) return
    room = next
    lock.textContent = room.locked ? 'Unlock room' : 'Lock room'
    lock.setAttribute('aria-pressed', String(room.locked))
    for (const id of peers.keys()) if (!room.players.some(player => player.socketId === id && player.connected)) drop(id)
    for (const player of room.players.filter(player => player.slot > 0 && player.connected)) {
      if (peers.has(player.socketId)) continue
      const receiver = inputReceiver((index, value) => emu.gameManager.functions.simulateInput(player.slot, index, value), undefined, core)
      const peer = createPeer(socket, player.socketId, null, state => {
        if (peers.get(player.socketId) !== peer) return
        if (state === 'connected') status(`${player.nickname} connected as Player ${player.slot + 1}.`, panel)
        if (['disconnected', 'failed', 'closed'].includes(state)) {
          clearTimeout(peer.deadline)
          receiver.release()
          if (state !== 'closed') status(`${player.nickname} lost the game connection. Ask them to reconnect.`, panel)
        }
        refreshRoster()
      })
      peer.receiver = receiver
      peer.deadline = setTimeout(() => {
        if (peers.get(player.socketId) !== peer) return
        peer.timedOut = true
        refreshRoster()
        status(`Player ${player.slot + 1} · ${player.nickname} timed out. Ask them to reconnect on the same LAN; Wi-Fi client isolation can prevent joining.`, panel)
      }, 15000)
      peers.set(player.socketId, peer)
      for (const track of stream.getTracks()) peer.pc.addTrack(track, stream)
      const channel = peer.pc.createDataChannel('controls', { ordered: true })
      peer.channel = channel
      channel.onopen = refreshRoster
      channel.onmessage = event => {
        if (peers.get(player.socketId) !== peer || channel.readyState !== 'open') return
        receiver.receive(event.data, !emu.paused && peer.pc.connectionState === 'connected')
      }
      channel.onclose = () => { receiver.release(); refreshRoster() }
      channel.onerror = () => { receiver.release(); refreshRoster() }
      void peer.pc.createOffer().then(offer => peer.pc.setLocalDescription(offer)).then(() => {
        if (room && peers.get(player.socketId) === peer) socket.emit('room:signal', { target: player.socketId, signal: { description: peer.pc.localDescription.toJSON() } })
      }).catch(error => { if (peers.get(player.socketId) === peer) status(`Could not connect guest: ${error.message}`, panel) })
    }
    refreshRoster()
  }
  const pauseButton = panel.querySelector('[data-lan-pause]')
  const watchdog = setInterval(() => {
    pauseButton.textContent = emu.paused ? 'Resume game' : 'Pause game'
    for (const peer of peers.values()) {
      if (emu.paused) peer.receiver.release()
      else peer.receiver.check()
    }
  }, 250)
  const cleanup = () => {
    if (stopped) return
    stopped = true
    generation++
    clearInterval(watchdog)
    socket?.emit('room:leave', {})
    socket?.disconnect()
    for (const id of peers.keys()) drop(id)
    stopStream()
    if (originalInput) emu.gameManager.simulateInput = originalInput
  }
  window.addEventListener('pagehide', cleanup, { once: true })
  emu.on?.('exit', cleanup)
  async function initialize() {
  try {
    const info = await lanInfo()
    if (stopped) return
    socket = await connectSocket()
    if (stopped) { socket.disconnect(); return }
    const addresses = info.addresses.length ? info.addresses : [location.origin]
    for (const origin of addresses) { const option = document.createElement('option'); option.value = origin; option.textContent = origin; address.append(option) }
    // Prefer the address this host already reached the server with.
    if (addresses.includes(location.origin)) address.value = location.origin
    const loopbackOnly = !info.addresses.length
    const refreshInvite = () => {
      invite.value = room ? `${address.value}/lan.html#${room.code}` : ''
      if (room) panel.querySelector('[data-lan-qr]').src = `/api/lan/qr?invite=${encodeURIComponent(invite.value)}`
    }
    address.onchange = refreshInvite
    socket.on('room:update', update)
    socket.on('room:signal', ({ sender, signal }) => { void peers.get(sender)?.accept(signal) })
    socket.on('room:ended', ({ reason }) => endLocal(ending ? 'Room ended. You can continue playing locally.' : reason))
    socket.on('disconnect', () => { retry.hidden = false; endLocal('The LAN server disconnected. Retry connection, then create a new room.') })
    socket.on('connect_error', () => { retry.hidden = false; status('Cannot reach the LAN server. Retry when it is back.', panel) })
    socket.on('connect', serviceReady)
    form.onsubmit = async event => {
      event.preventDefault()
      if (busy || !socket.connected || room) return
      busy = true; createButton.disabled = true
      const attempt = ++generation
      try {
        stream = capture()
        const data = new FormData(form)
        saveNickname(String(data.get('nickname')))
        const reply = await request(socket, 'room:create', { nickname: String(data.get('nickname')), title: emu.config.gameName || 'Game', core, maxPlayers: Number(data.get('maxPlayers') || 2) })
        if (stopped || attempt !== generation || !socket.connected) return
        room = reply.room
        for (let slot = 1; slot < profile.maxPlayers; slot++) for (const index of inputIndices(core)) emu.gameManager.functions.simulateInput(slot, index, 0)
        update(room)
        refreshInvite()
        form.hidden = true; roomBox.hidden = false
        panel.querySelector('[data-lan-copy]').focus({ preventScroll: true })
        status(loopbackOnly ? 'Room open, but this computer has no LAN address. Connect it to Wi-Fi or Ethernet so other devices can join.'
          : stream.getAudioTracks().length ? `Room open for ${room.maxPlayers} players. Share the invite on the same Wi-Fi.` : 'Room open with video only; this core did not provide audio capture.', panel)
      } catch (error) {
        if (!stopped && attempt === generation) {
          if (socket.connected) socket.emit('room:leave', {})
          endLocal(error.message)
        }
      }
      finally { if (attempt === generation) { busy = false; createButton.disabled = !socket.connected } }
    }
    panel.querySelector('[data-lan-copy]').onclick = async () => {
      try { await navigator.clipboard.writeText(invite.value); status('Invite copied. Send it to someone on the same Wi-Fi.', panel) }
      catch {
        invite.closest('details').open = true
        invite.focus({ preventScroll: true })
        invite.select()
        status('Select and copy the invite link above.', panel)
      }
    }
    lock.onclick = () => { if (room) void request(socket, 'room:lock', { locked: !room.locked }).catch(error => status(error.message, panel)) }
    panel.querySelector('[data-lan-pause]').onclick = () => {
      if (emu.paused) emu.play?.(true)
      else { for (const peer of peers.values()) peer.receiver.release(); emu.pause?.(true) }
      panel.querySelector('[data-lan-pause]').textContent = emu.paused ? 'Resume game' : 'Pause game'
    }
    panel.querySelector('[data-lan-end]').onclick = () => {
      const current = room?.code
      if (!current) return
      // The server announces room:ended before acknowledging the leave.
      ending = true
      void request(socket, 'room:leave').then(() => { if (room?.code === current) endLocal('Room ended. You can continue playing locally.') })
        .catch(error => { if (room?.code === current) { ending = false; status(error.message, panel) } })
    }
    serviceReady()
  } catch (error) { if (!stopped) { createButton.disabled = true; retry.hidden = false; status(error.message, panel) } }
  }
  retry.onclick = async () => {
    retryFocus = document.activeElement === retry
    retry.disabled = true
    status('Reconnecting to the LAN room service…', panel)
    try {
      if (socket) { socket.disconnect(); socket.connect() }
      else await initialize()
    } finally { retry.disabled = false }
  }
  await initialize()
  return { cleanup, panel }
}

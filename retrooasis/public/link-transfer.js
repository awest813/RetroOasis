/** File and session messages on the reliable 'cart' data channel of a link room.
 * A file is one JSON header followed by binary chunks of exactly `size` bytes. */
export const CHUNK = 16 * 1024
export const SAVE_LIMIT = 131072 + 64

export async function sendFile(channel, kind, name, bytes) {
  channel.bufferedAmountLowThreshold = CHUNK * 4
  channel.send(JSON.stringify({ type: 'file', kind, name: String(name).slice(0, 120), size: bytes.length }))
  for (let at = 0; at < bytes.length; at += CHUNK) {
    if (channel.readyState !== 'open') throw new Error('The connection closed during the transfer.')
    if (channel.bufferedAmount > CHUNK * 16) {
      await new Promise(resolve => {
        const done = () => { channel.removeEventListener('bufferedamountlow', done); channel.removeEventListener('close', done); resolve() }
        channel.addEventListener('bufferedamountlow', done); channel.addEventListener('close', done)
      })
    }
    channel.send(bytes.slice(at, at + CHUNK))
  }
}

/** limits: { [kind]: maximum bytes }. Unknown kinds, oversized or interleaved files are rejected. */
export function fileReceiver({ limits, onFile, onMessage, onError, onProgress }) {
  let pending = null
  return data => {
    try {
      if (typeof data === 'string') {
        if (data.length > 2048) throw new Error('Unexpected link message.')
        const message = JSON.parse(data)
        if (message?.type !== 'file') { if (message && typeof message.type === 'string') onMessage?.(message); return }
        if (pending) throw new Error('A transfer was interrupted. Send it again.')
        const limit = limits[message.kind]
        if (!limit || !Number.isSafeInteger(message.size) || message.size < 0 || message.size > limit) throw new Error(`That ${message.kind === 'save' ? 'save file' : 'cartridge'} is too large or not allowed here.`)
        pending = { kind: message.kind, name: String(message.name || message.kind), bytes: new Uint8Array(message.size), received: 0 }
        if (!message.size) { const done = pending; pending = null; onFile(done) }
        return
      }
      if (!pending) throw new Error('Unexpected file data.')
      const chunk = new Uint8Array(data)
      if (pending.received + chunk.length > pending.bytes.length) throw new Error('A file arrived larger than announced.')
      pending.bytes.set(chunk, pending.received)
      pending.received += chunk.length
      onProgress?.(pending.kind, pending.received, pending.bytes.length)
      if (pending.received === pending.bytes.length) { const done = pending; pending = null; onFile(done) }
    } catch (error) { pending = null; onError?.(error) }
  }
}

export function downloadBytes(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
  const link = document.createElement('a')
  link.href = url; link.download = name
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export function saveName(romName) {
  return `${String(romName || 'game').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_') || 'game'}.sav`
}

/** MD5 (RFC 1321). RetroAchievements identifies games by MD5, and Web Crypto does not offer it. */

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10,
  15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const K = new Uint32Array(64)
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000)

function rotl(n: number, bits: number): number {
  return ((n << bits) | (n >>> (32 - bits))) >>> 0
}

export class Md5 {
  private a = 0x67452301
  private b = 0xefcdab89
  private c = 0x98badcfe
  private d = 0x10325476
  private bytes = 0
  private readonly buffer = new Uint8Array(64)
  private buffered = 0
  private done = false

  update(chunk: Uint8Array): void {
    if (this.done) throw new Error('MD5 digest already finished')
    this.bytes += chunk.length
    let offset = 0
    if (this.buffered) {
      const take = Math.min(64 - this.buffered, chunk.length)
      this.buffer.set(chunk.subarray(0, take), this.buffered)
      this.buffered += take
      offset = take
      if (this.buffered < 64) return
      this.compress(this.buffer)
      this.buffered = 0
    }
    while (offset + 64 <= chunk.length) {
      this.compress(chunk.subarray(offset, offset + 64))
      offset += 64
    }
    if (offset < chunk.length) {
      this.buffer.set(chunk.subarray(offset))
      this.buffered = chunk.length - offset
    }
  }

  /** Lowercase hex digest. The hasher cannot be reused afterward. */
  hex(): string {
    if (this.done) throw new Error('MD5 digest already finished')
    const bitsLow = (this.bytes * 8) >>> 0
    const bitsHigh = Math.floor(this.bytes / 0x20000000) >>> 0
    const padLen = this.buffered < 56 ? 56 - this.buffered : 120 - this.buffered
    const tail = new Uint8Array(padLen + 8)
    tail[0] = 0x80
    const view = new DataView(tail.buffer)
    view.setUint32(padLen, bitsLow, true)
    view.setUint32(padLen + 4, bitsHigh, true)
    this.update(tail)
    this.done = true
    const out = new Uint8Array(16)
    const words = new DataView(out.buffer)
    words.setUint32(0, this.a, true)
    words.setUint32(4, this.b, true)
    words.setUint32(8, this.c, true)
    words.setUint32(12, this.d, true)
    let hex = ''
    for (const byte of out) hex += byte.toString(16).padStart(2, '0')
    return hex
  }

  private compress(block: Uint8Array): void {
    const m = new Uint32Array(16)
    const view = new DataView(block.buffer, block.byteOffset, 64)
    for (let i = 0; i < 16; i++) m[i] = view.getUint32(i * 4, true)
    let a = this.a
    let b = this.b
    let c = this.c
    let d = this.d
    for (let i = 0; i < 64; i++) {
      let f = 0
      let g = 0
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      const summed = (a + f + K[i] + m[g]) >>> 0
      const rotated = (b + rotl(summed, S[i])) >>> 0
      a = d
      d = c
      c = b
      b = rotated
    }
    this.a = (this.a + a) >>> 0
    this.b = (this.b + b) >>> 0
    this.c = (this.c + c) >>> 0
    this.d = (this.d + d) >>> 0
  }
}

export function md5Hex(bytes: Uint8Array): string {
  const hash = new Md5()
  hash.update(bytes)
  return hash.hex()
}

export function md5Text(value: string): string {
  return md5Hex(new TextEncoder().encode(value))
}

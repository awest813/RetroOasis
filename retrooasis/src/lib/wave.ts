/** Animated XMB-style wave background (canvas). */

type Cleanup = () => void

let waveActive = true

/** Pause drawing when the XMB shell is not showing. */
export function setWaveActive(on: boolean): void {
  waveActive = on
}

export function mountWave(canvas: HTMLCanvasElement): Cleanup {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => undefined

  let raf = 0
  let running = true
  let width = 0
  let height = 0
  let dpr = 1
  let wasActive = true
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = canvas.clientWidth
    height = canvas.clientHeight
    canvas.width = Math.max(1, Math.floor(width * dpr))
    canvas.height = Math.max(1, Math.floor(height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const accent = () => {
    const styles = getComputedStyle(document.documentElement)
    return styles.getPropertyValue('--ro-accent').trim() || '#2ee6d6'
  }

  const drawRibbon = (
    t: number,
    band: { amp: number; len: number; speed: number; y: number; alpha: number },
    color: string,
  ) => {
    const points: { x: number; y: number }[] = []
    for (let x = 0; x <= width; x += 3) {
      const y =
        band.y +
        Math.sin(x * band.len + t * band.speed) * band.amp +
        Math.sin(x * band.len * 0.42 - t * band.speed * 0.65) * (band.amp * 0.4) +
        Math.sin(x * band.len * 1.7 + t * band.speed * 0.25) * (band.amp * 0.12)
      points.push({ x, y })
    }

    // Soft filled ribbon body
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
    for (let i = points.length - 1; i >= 0; i--) {
      ctx.lineTo(points[i].x, points[i].y + 48)
    }
    ctx.closePath()
    const fill = ctx.createLinearGradient(0, band.y - band.amp, 0, band.y + 70)
    fill.addColorStop(0, color)
    fill.addColorStop(0.45, color)
    fill.addColorStop(1, 'transparent')
    ctx.globalAlpha = band.alpha * 0.22
    ctx.fillStyle = fill
    ctx.fill()

    // Bright crest stroke
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
    ctx.strokeStyle = color
    ctx.globalAlpha = band.alpha
    ctx.lineWidth = 1.6
    ctx.stroke()
  }

  const draw = (t: number) => {
    if (!running) return
    raf = requestAnimationFrame(draw)
    if (!width || !height) return

    if (!waveActive) {
      if (wasActive) {
        ctx.clearRect(0, 0, width, height)
        wasActive = false
      }
      return
    }
    wasActive = true

    const time = reduced ? 0 : t * 0.001
    ctx.clearRect(0, 0, width, height)

    const color = accent()
    const bands = [
      { amp: 16, len: 0.0075, speed: 0.42, y: height * 0.4, alpha: 0.14 },
      { amp: 26, len: 0.006, speed: 0.3, y: height * 0.48, alpha: 0.2 },
      { amp: 34, len: 0.0048, speed: 0.22, y: height * 0.56, alpha: 0.17 },
      { amp: 20, len: 0.0085, speed: 0.36, y: height * 0.64, alpha: 0.11 },
      { amp: 14, len: 0.01, speed: 0.5, y: height * 0.72, alpha: 0.08 },
    ]

    for (const band of bands) drawRibbon(time, band, color)

    // Soft ambient glow along the mid band
    const glow = ctx.createRadialGradient(
      width * 0.35,
      height * 0.55,
      20,
      width * 0.45,
      height * 0.58,
      width * 0.55,
    )
    glow.addColorStop(0, color)
    glow.addColorStop(1, 'transparent')
    ctx.globalAlpha = 0.05
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, width, height)

    ctx.globalAlpha = 1
  }

  resize()
  raf = requestAnimationFrame(draw)
  window.addEventListener('resize', resize)

  return () => {
    running = false
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
  }
}

/** Animated XMB-style wave background (canvas). */

type Cleanup = () => void

export function mountWave(canvas: HTMLCanvasElement): Cleanup {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => undefined

  let raf = 0
  let running = true
  let width = 0
  let height = 0
  let dpr = 1
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

  const draw = (t: number) => {
    if (!running) return
    raf = requestAnimationFrame(draw)
    if (!width || !height) return

    const time = reduced ? 0 : t * 0.001
    ctx.clearRect(0, 0, width, height)

    const color = accent()
    const bands = [
      { amp: 18, len: 0.008, speed: 0.55, y: height * 0.42, alpha: 0.16, width: 1.4 },
      { amp: 28, len: 0.0065, speed: 0.38, y: height * 0.5, alpha: 0.22, width: 1.8 },
      { amp: 36, len: 0.0052, speed: 0.28, y: height * 0.58, alpha: 0.18, width: 2.2 },
      { amp: 22, len: 0.009, speed: 0.48, y: height * 0.66, alpha: 0.12, width: 1.2 },
    ]

    for (const band of bands) {
      ctx.beginPath()
      for (let x = 0; x <= width; x += 4) {
        const y =
          band.y +
          Math.sin(x * band.len + time * band.speed) * band.amp +
          Math.sin(x * band.len * 0.45 - time * band.speed * 0.7) * (band.amp * 0.35)
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = color
      ctx.globalAlpha = band.alpha
      ctx.lineWidth = band.width
      ctx.stroke()

      // soft fill under wave
      ctx.lineTo(width, height)
      ctx.lineTo(0, height)
      ctx.closePath()
      ctx.globalAlpha = band.alpha * 0.25
      ctx.fillStyle = color
      ctx.fill()
    }

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

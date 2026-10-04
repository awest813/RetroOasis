// GBA hardware frame duration: 280896 cycles at 16777216 Hz.
// Both consoles consume the same budget, regardless of display refresh rate.
export function frameClock() {
  const duration = 280896 * 1000 / 16777216
  let previous = null, remainder = 0
  return {
    reset() { previous = null; remainder = 0 },
    take(now) {
      if (previous === null) { previous = now; return 0 }
      const elapsed = Math.max(0, now - previous)
      previous = now
      // Discard background time and cap catch-up work to four paired frames.
      remainder = Math.min(duration * 4, remainder + elapsed)
      const frames = Math.floor((remainder + 1e-8) / duration)
      remainder -= frames * duration
      return frames
    },
  }
}

import assert from 'node:assert/strict'
import { frameClock } from './frame-clock.js'

for (const refresh of [30, 60, 120, 144]) {
  const clock = frameClock()
  let frames = 0
  for(let tick=0;tick<=refresh*10;tick++) frames += clock.take(tick * 1000 / refresh)
  assert.equal(frames,597,`Ten seconds at ${refresh} Hz produces the same hardware frame count`)
  assert.equal(clock.take(60000),4,'Background catch-up is bounded')
  clock.reset()
  assert.equal(clock.take(90000),0,'Pause / visibility resets discard elapsed time')
  assert.equal(clock.take(90001),0)
}
console.log('PASS paired GBA frame pacing at 30 / 60 / 120 / 144 Hz and bounded background catch-up')

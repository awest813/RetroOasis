import { cartridge, boot, blockCartridge, transferByte } from './link-fixtures.js'
import { frameClock } from './frame-clock.js'
import { buttonHolds } from './lan-shared.js'
const result = document.querySelector('#result')
const gbButton = document.querySelector('#gb'), gbaButton = document.querySelector('#gba')
const pauseButton = document.querySelector('#pause')
const check = (value, message) => { if (!value) throw Error(message) }
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
let pageActive = true
gbButton.onclick = async () => {
  gbButton.disabled = true
  const gbaDisabled = gbaButton.disabled
  gbaButton.disabled = true
  let core
  try {
    result.textContent = 'Loading SameBoy WASM…'
    const { default: create } = await import('/sameboy-link.mjs')
    core = await create()
    check(pageActive, 'Fixture closed')
    const load = (slot, rom) => {
      const r = core._malloc(rom.length), b = core._malloc(boot.length)
      try { core.HEAPU8.set(rom, r); core.HEAPU8.set(boot, b); check(core._link_load(slot, r, rom.length, b, boot.length) === 1, 'Load failed') }
      finally { core._free(r); core._free(b) }
    }
    const backup = slot => {
      const size = core._link_save_size(slot), pointer = core._malloc(size)
      try { check(core._link_save(slot, pointer, size) === 0, 'Save export failed'); return core.HEAPU8.slice(pointer, pointer + size) }
      finally { core._free(pointer) }
    }
    const lines = []
    for (const color of [0, 1]) {
      core._link_init(color); load(0, cartridge(true, color)); load(1, cartridge(false, color))
      for (let frame = 0; frame < 10; frame++) { await nextFrame(); check(pageActive, 'Fixture closed'); check(core._link_step(280896) > 0, 'Stepping failed') }
      check(core._link_peek(0, 0xc000) === 0x5a && core._link_peek(1, 0xc000) === 0xa5 && core._link_serial_bits() === 8, 'Serial exchange failed')
      const saves = [backup(0), backup(1)]
      check(saves[0].some((byte, index) => byte !== saves[1][index]), 'Saves must differ')
      core._link_init(color); load(0, cartridge(true, color)); load(1, cartridge(false, color))
      saves.forEach((save, slot) => {
        const pointer = core._malloc(save.length)
        try { core.HEAPU8.set(save, pointer); check(core._link_restore(slot, pointer, save.length) === 1, 'Save restore failed') }
        finally { core._free(pointer) }
        check(backup(slot).every((byte, index) => byte === save[index]), 'Save reload differs')
      })
      lines.push(`PASS ${color ? 'GBC' : 'GB'} browser WASM: bidirectional serial exchange, separate save exports / reloads, frame scheduling.`)
    }
    for (const [color, fast] of [[0,false],[1,false],[1,true]]) {
      core._link_init(color)
      for(let slot=0;slot<2;slot++) load(slot,blockCartridge(slot,color,{fast}))
      core._link_set_paused(1); check(core._link_step(280896) === 0, 'Pause advanced serial clocks'); core._link_set_paused(0)
      for(let frame=0;frame<80 && (core._link_peek(0,0xc100)!==1 || core._link_peek(1,0xc100)!==1);frame++) {
        await nextFrame(); check(pageActive, 'Fixture closed'); core._link_step(280896)
      }
      check(core._link_serial_bits() === 512, 'Block transfer clock count differs')
      for(let slot=0;slot<2;slot++) {
        check(core._link_peek(slot,0xc100) === 1, 'Block transfer did not finish')
        const save = backup(slot)
        for(let index=0;index<64;index++) check(core._link_peek(slot,0xc000+index) === transferByte(1-slot,index) && save[index] === transferByte(1-slot,index), 'Received block / battery save differs')
      }
      lines.push(`PASS ${color?'GBC':'GB'} ${fast?'fast':'normal'}: 64-byte cable transfer, clock master reversal, pause and isolated battery writes.`)
    }
    result.textContent = lines.join('\n')
  } catch (error) { result.textContent = 'FAIL: ' + error.message }
  finally { core?._link_close(); gbButton.disabled = false; gbaButton.disabled = gbaDisabled }
}
let cores = [], running = false, animation, controlsHeld = []
const clock = frameClock()
function clearInputs() { controlsHeld.forEach(held => held.clear()) }
function closeGba() {
  running = false; cancelAnimationFrame(animation)
  clearInputs(); controlsHeld = []; clock.reset()
  cores.forEach(core => core._gba_close()); cores = []
}
window.addEventListener('pagehide', () => { pageActive = false; closeGba() })
window.addEventListener('blur', clearInputs)
document.addEventListener('visibilitychange', () => { clearInputs(); clock.reset() })
gbaButton.onclick = async () => {
  gbaButton.disabled = true; gbButton.disabled = true
  document.querySelector('#screens').replaceChildren()
  const inbox = [[], []], screens = [], contexts = []
  let sent = 0, received = 0, frames = 0, maxStep = 0, started
  const drain = id => {
    for (const { bytes, sender } of inbox[id].splice(0)) {
      const core = cores[id], pointer = core._malloc(bytes.length)
      try { core.HEAPU8.set(bytes, pointer); core._gba_receive(pointer, bytes.length, sender); received++ }
      finally { core._free(pointer) }
    }
  }
  try {
    result.textContent = 'Loading two isolated gpSP WASM consoles…'
    const { default: create } = await import('/gpsp-link.mjs')
    const response = await fetch('/rom'); check(response.ok, 'Supply an Advance Wars USA ROM to the fixture server')
    const rom = new Uint8Array(await response.arrayBuffer())
    check(pageActive, 'Fixture closed')
    for (let id = 0; id < 2; id++) {
      const core = await create({ onPoll: () => drain(id), onPacket: (_flags, bytes, target) => {
        check(bytes.length <= 65536 && inbox[1 - id].length < 1024, 'Packet queue exceeded bounds')
        if (target === 65535 || target === 1 - id) { inbox[1 - id].push({ bytes, sender: id }); sent++ }
      } })
      cores.push(core); check(pageActive, 'Fixture closed'); check(core._gba_init() === 1, 'Netpacket interface unavailable')
      core.FS.writeFile('/AdvanceWars.gba', rom)
      check(core.cwrap('gba_load', 'number', ['string'])('/AdvanceWars.gba') === 1, 'ROM failed to load')
      check(core._gba_start(id) === 1, 'Link start failed')
      const section = document.createElement('section'), heading = document.createElement('h2'), canvas = document.createElement('canvas'), controls = document.createElement('div')
      heading.textContent = `Console ${id + 1}`; canvas.width = 240; canvas.height = 160
      screens.push(canvas); contexts.push(canvas.getContext('2d'))
      const held = buttonHolds(() => {
        const keys = new Set(held.values())
        for(let index=0;index<16;index++) core._gba_key(index, Number(keys.has(index)))
      }, { minimum: 200 })
      controlsHeld.push(held)
      for (const [index, label] of [[4, 'Up'], [5, 'Down'], [6, 'Left'], [7, 'Right'], [8, 'A'], [0, 'B'], [3, 'Start'], [2, 'Select'], [10, 'L'], [11, 'R']]) {
        const button = document.createElement('button'); button.textContent = label; button.setAttribute('aria-label', `Console ${id + 1} ${label}`)
        button.onpointerdown = event => {
          if (!running || event.button !== 0) return
          event.preventDefault(); button.setPointerCapture(event.pointerId); held.press(event.pointerId,index)
        }
        button.onpointerup = event => held.release(event.pointerId)
        button.onpointercancel = event => held.cancel(event.pointerId)
        button.onlostpointercapture = event => held.lostCapture(event.pointerId)
        button.onclick = event => {
          if (!running || event.detail !== 0) return
          const token = Symbol('tap'); held.press(token,index); held.release(token)
        }
        controls.append(button)
      }
      section.append(heading, canvas, controls); document.querySelector('#screens').append(section)
    }
    check(cores[0]._gba_connect(1) === 1 && cores[1]._gba_connect(0) === 1, 'Membership registration failed')
    running = true; pauseButton.hidden = false; started = performance.now()
    const draw = id => {
      const pointer = cores[id]._gba_pixels(), pixels = cores[id].HEAPU16.subarray(pointer / 2, pointer / 2 + 240 * 160), image = contexts[id].createImageData(240, 160)
      for (let i = 0; i < pixels.length; i++) {
        const pixel = pixels[i], offset = i * 4
        image.data[offset] = (pixel >> 11) * 255 / 31; image.data[offset + 1] = ((pixel >> 5) & 63) * 255 / 63; image.data[offset + 2] = (pixel & 31) * 255 / 31; image.data[offset + 3] = 255
      }
      contexts[id].putImageData(image, 0, 0)
    }
    const tick = now => {
      try {
        if (running && !document.hidden) {
          const before = performance.now()
          const previousFrames = frames, steps = clock.take(now)
          for(let step=0;step<steps;step++) {
            for (let id = 0; id < 2; id++) { drain(id); cores[id]._gba_run() }
            frames++
          }
          if (steps) for(let id=0;id<2;id++) draw(id)
          maxStep = Math.max(maxStep, performance.now() - before)
          if (previousFrames < 180 && frames >= 180) {
            check(received > 0 && received >= sent - 2, 'Packet delivery failed or queue is accumulating')
            check(cores.every(core => core._gba_frames() >= 180 && core._gba_audio_frames() > 0), 'Video/audio callbacks missing')
          }
          if (Math.floor(previousFrames/60) !== Math.floor(frames/60)) result.textContent = `${frames >= 180 ? 'PASS browser boot / packet routing' : 'Running'}: two gpSP consoles; ${frames} frames each; ${sent}/${received} packets sent/delivered; max step ${maxStep.toFixed(1)} ms; elapsed ${((performance.now() - started) / 1000).toFixed(1)} s.\nPaired pacing: 59.73 Hz, maximum four-frame catch-up.\nAudio callbacks: ${cores.map(core => core._gba_audio_frames()).join(' / ')}. Audio playback pending.\nPressed input polls: ${cores.map(core => core._gba_pressed_polls()).join(' / ')}.\nNOT A LINK GAMEPLAY PASS: enter multiplayer and finish a match.`
        }
        animation = requestAnimationFrame(tick)
      } catch (error) { result.textContent = 'FAIL: ' + error.message; closeGba(); pauseButton.hidden = true }
    }
    clock.reset(); animation = requestAnimationFrame(tick)
  } catch (error) { result.textContent = 'FAIL: ' + error.message; closeGba(); gbaButton.disabled = false; gbButton.disabled = false }
}
pauseButton.onclick = () => {
  running = !running
  clearInputs(); clock.reset()
  cores.forEach(core => core._gba_set_paused(Number(!running)))
  pauseButton.textContent = running ? 'Pause both' : 'Resume both'
}

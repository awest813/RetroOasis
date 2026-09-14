import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import ts from 'typescript'
const compile = name => ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const gamepadSource = compile('gamepad').replace("import { setModalityFromPad } from './inputModality';", 'const setModalityFromPad = () => {};')
const { MenuRepeater, menuDirection, readConnectedPad, connectedPads } = await import('data:text/javascript;base64,' + Buffer.from(gamepadSource).toString('base64'))
let pads = []
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => pads } })
const pad = { connected: true, index: 2, id: 'Fixture controller', mapping: 'standard', axes: [0, 0], buttons: Array.from({length:17}, () => ({pressed:false, value:0})) }
pads = [null, null, pad]
assert.equal(readConnectedPad(), pad)
pads = [{...pad, mapping:''}, null, pad]
assert.equal(readConnectedPad(), pad)
navigator.getGamepads = () => { throw new Error('Blocked') }
assert.deepEqual(connectedPads(), [])
navigator.getGamepads = () => pads
const reader = new MenuRepeater()
pad.buttons[0].pressed = true
assert.equal(reader.read(pad, 0), null, 'Ignore wake-up press')
pad.buttons[0].pressed = false
reader.read(pad, 10)
pad.buttons[0].pressed = true
assert.equal(reader.read(pad, 20), 'confirm')
assert.equal(reader.read(pad, 1000), null, 'Held confirm must not repeat')
reader.reset()
assert.equal(reader.read(pad, 1100), null, 'Held confirm must not cross views')
pad.buttons[0].pressed = false
reader.read(pad, 1200)
pad.axes = [0.2, -0.3]
assert.equal(menuDirection(pad), null, 'Ignore stick drift')
pad.axes = [0.8, 0.7]
assert.equal(reader.read(pad, 1300), 'right')
assert.equal(reader.read(pad, 1400), null)
assert.equal(reader.read(pad, 1660), 'right')
reader.read(null, 1700)
assert.equal(reader.read(pad, 1800), null, 'Reconnect requires release')
pad.buttons[1].pressed = true
pad.buttons[0].pressed = true
assert.equal(menuDirection(pad), 'back', 'Back wins simultaneous press')
reader.reset()
pad.buttons.forEach(b => b.pressed = false); pad.axes = [0, 0]
reader.read(pad, 1900)
pad.buttons[1].pressed = true; pad.buttons[0].pressed = true
assert.equal(reader.read(pad, 2000), 'back')
pad.buttons[1].pressed = false
assert.equal(reader.read(pad, 2100), null, 'Releasing Back must not activate held Confirm')
pad.buttons[0].pressed = false; reader.read(pad, 2200)
pad.buttons[0].pressed = true
assert.equal(reader.read(pad, 2300), 'confirm', 'Actions resume after full release')
const { GamepadHandler } = await import('../../data/src/gamepad.js')
globalThis.window = { clearTimeout }
const handler = Object.create(GamepadHandler.prototype)
handler.gamepads = []; handler.listeners = {}; handler.buttonLabels = {}
pad.axes = [0, 0]; pad.buttons.forEach(b => b.pressed = false); pads = [pad]
handler.updateGamepadState()
let downs = 0
handler.on('buttondown', () => downs++)
pad.buttons[0].pressed = true
handler.updateGamepadState()
assert.equal(downs, 1, 'Detect mutation of browser-reused Gamepad object')
navigator.getGamepads = () => { throw new Error('Blocked') }
assert.doesNotThrow(() => handler.updateGamepadState())
console.log('PASS controller selection, blocked access, drift, repeat, reconnect, route release and live-object snapshots')
if (process.argv.includes('--browser')) {
  const focus = compile('focus').replace("from './gamepad'", "from '/gamepad.js'").replace(/import \{ sfxConfirm, sfxMove \} from '.\/sfx';/, 'const sfxConfirm = () => {}; const sfxMove = () => {};')
  const fixture = fs.readFileSync(new URL('./gamepad-browser-tests.js', import.meta.url), 'utf8')
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const scripts = {'/gamepad.js': gamepadSource, '/focus.js': focus, '/tests.js': fixture}
    if (scripts[req.url]) { res.setHeader('Content-Type', 'text/javascript'); res.end(scripts[req.url]); return }
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><title>Controller navigation tests</title><h1>Controller navigation tests</h1><pre id="results">Running…</pre><script type="module" src="/tests.js"></script>')
  })
  server.listen(0, '127.0.0.1', () => console.log(`Controller tests: http://127.0.0.1:${server.address().port}/`))
}
